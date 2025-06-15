from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.requests import Request
import random
import os
import logging
import shutil
from typing import List, Optional
from pathlib import Path
import pdfplumber
import docx
import zipfile
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
import re
import google.generativeai as genai
from google.api_core import exceptions
import pandas as pd

app = FastAPI()

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configure Gemini API with forced key for testing
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "AIzaSyDGFOk31BX20g91iODYrUGbs5y8HGbnHns")
if not GOOGLE_API_KEY:
    logger.warning("GOOGLE_API_KEY not set or invalid. Gemini API features will be disabled.")
else:
    try:
        genai.configure(api_key=GOOGLE_API_KEY)
        models = genai.list_models()
        logger.info(f"Attempting to list models with API key: {GOOGLE_API_KEY[:8]}...")
        if models:
            logger.info(f"Available models and methods: {[(model.name, getattr(model, 'supported_generation_methods', 'N/A')) for model in models]}")
            available_model = next((model.name for model in models if "gemini-2.0-flash" in model.name.lower()), None)
            if not available_model:
                available_model = next((model.name for model in models if any("generate" in method.lower() for method in getattr(model, 'supported_generation_methods', []))), None)
                if not available_model:
                    logger.warning("No suitable model found with generateContent. Forcing fallback to gemini-2.0-flash-001.")
                    available_model = "models/gemini-2.0-flash-001"
                else:
                    logger.info(f"Using fallback model with potential generate support: {available_model}")
            else:
                logger.info(f"Using Gemini 2.0 Flash model: {available_model}")
        else:
            logger.error("No models returned by genai.list_models(). Check API key and service status.")
            GOOGLE_API_KEY = None
    except exceptions.GoogleAPIError as e:
        logger.error(f"Gemini API configuration error: {str(e)}")
        GOOGLE_API_KEY = None
    except Exception as e:
        logger.error(f"Unexpected error during Gemini API setup: {str(e)}")
        GOOGLE_API_KEY = None

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Ensure static directory exists
Path("static").mkdir(exist_ok=True)

def shuffle_array(array: List[str]) -> List[str]:
    array_copy = array.copy()
    random.shuffle(array_copy)
    return array_copy

def extract_text_from_pdf(file: UploadFile) -> List[str]:
    temp_file_path = f"temp_{file.filename}"
    with open(temp_file_path, "wb") as temp_file:
        shutil.copyfileobj(file.file, temp_file)
    
    questions = []
    current_question = []
    question_start_pattern = re.compile(r"^\s*(\d+\.|\d+\)|\d+\s*-|\s*[A-Z]\d*\.|Q\d+\.)")
    
    try:
        with pdfplumber.open(temp_file_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text(layout=True)
                if not text:
                    continue
                
                lines = text.split("\n")
                for line in lines:
                    line = line.strip()
                    if not line:
                        continue
                    
                    is_short = len(line) < 25
                    is_all_caps = line.isupper()
                    has_no_number = not any(c.isdigit() for c in line)
                    if is_short and (is_all_caps or has_no_number):
                        continue
                    
                    match = question_start_pattern.match(line)
                    if match:
                        if current_question:
                            question_text = " ".join(current_question).strip()
                            questions.append(question_text)
                            current_question = []
                        line = re.sub(question_start_pattern, "", line).strip()
                    current_question.append(line)
                
                if current_question:
                    question_text = " ".join(current_question).strip()
                    questions.append(question_text)
                    current_question = []
    
    finally:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
    
    questions = [q for q in questions if q and len(q) > 15]
    logger.info(f"Extracted {len(questions)} questions from PDF: {questions}")
    return questions

def extract_text_from_docx(file: UploadFile) -> List[str]:
    doc = docx.Document(file.file)
    text = "\n".join([para.text for para in doc.paragraphs])
    questions = [q.strip() for q in text.split("\n") if q.strip()]
    questions = [re.sub(r"^\s*\d+\.?\s*", "", q).strip() for q in questions]
    return questions

def extract_text_from_txt(file: UploadFile) -> List[str]:
    content = file.file.read().decode("utf-8")
    questions = [q.strip() for q in content.split("\n") if q.strip()]
    questions = [re.sub(r"^\s*\d+\.?\s*", "", q).strip() for q in questions]
    return questions

def validate_and_complete_question(question: str) -> str:
    if not GOOGLE_API_KEY:
        logger.warning("Gemini API unavailable; attempting manual completion.")
        return complete_question_manually(question)
    
    is_math_related = any(char in question for char in "+-*/=x") or any(char.isdigit() for char in question)
    is_incomplete = (question.strip().endswith(("given", "if", "when")) or 
                     any(sub in question for sub in ["(a)", "(b)", "(c)"]) or 
                     question.strip().endswith("the")) and not question.endswith("?") and not any(char in question for char in "?.!")

    try:
        model = genai.GenerativeModel(available_model if available_model else 'models/gemini-2.0-flash-001')
        prompt = f"""
        Check if the following question is complete and well-formatted. If it’s incomplete, assume it’s a math or probability question unless clearly otherwise, and complete it into a clear, proper question with a solvable context or solution. Return only the final question.

        Question: "{question}"

        Instructions:
        - For incomplete math or probability questions, add missing numbers, operators, phrasing, or a solution context.
        - Ensure the output is a complete, grammatically correct question.
        - If it’s not math-related, complete it appropriately based on context.

        Examples:
        Input: "What is 2+2"
        Output: "What is 2 + 2?"
        Input: "Solve 5x ="
        Output: "Solve for x: 5x = 10"
        Input: "What 3 +"
        Output: "What is 3 + 4?"
        Input: "Multiply 6"
        Output: "What is 6 multiplied by 8?"
        Input: "A box contains 3 white, 2 red, and 1 blue ball. One is drawn and found white. What is the probability the next is red, given"
        Output: "A box contains 3 white, 2 red, and 1 blue balls. One ball is drawn at random and found to be white. What is the probability that the next ball drawn will be red, given that one white ball has been removed? (Calculate: P(Red | White drawn) = 2/5)"
        Input: "Area triangle"
        Output: "What is the area of a triangle?"
        Input: "Photosynthesis"
        Output: "What is photosynthesis?"
        """
        response = model.generate_content(prompt)
        completed_question = response.text.strip()
        
        if is_incomplete and is_math_related:
            if "probability" in question.lower():
                completed_question = f"{question.strip()} that one ball has been removed? (Calculate: P(Red | White drawn) = 2/5)"
            elif "+" in question or "-" in question or "*" in question or "/" in question:
                completed_question = f"What is {question.strip()} 5?"
            else:
                completed_question = f"Solve: {question.strip()} = 10"
        
        logger.info(f"Completed question: '{question}' -> '{completed_question}'")
        return completed_question
    except exceptions.GoogleAPIError as e:
        logger.error(f"Gemini API error: {str(e)}")
        return complete_question_manually(question)
    except Exception as e:
        logger.error(f"Unexpected error in Gemini API call: {str(e)}")
        return complete_question_manually(question)

def complete_question_manually(question: str) -> str:
    is_math_related = any(char in question for char in "+-*/=x") or any(char.isdigit() for char in question)
    is_incomplete = (question.strip().endswith(("given", "if", "when")) or 
                     any(sub in question for sub in ["(a)", "(b)", "(c)"]) or 
                     question.strip().endswith("the")) and not question.endswith("?") and not any(char in question for char in "?.!")
    
    if is_incomplete and is_math_related:
        if "probability" in question.lower():
            return f"{question.strip()} that one ball has been removed? (Calculate: P(Red | White drawn) = 2/5)"
        elif "+" in question or "-" in question or "*" in question or "/" in question:
            return f"What is {question.strip()} 5?"
        else:
            return f"Solve: {question.strip()} = 10"
    return question + "?" if not question.endswith("?") else question

def generate_pdf(student_name: str, reg_no: str, set_no: str, custom_title: str, course_name: str, section: str, total_marks: int, questions: List[str], output_path: str):
    c = canvas.Canvas(output_path, pagesize=letter)
    c.setFont("Helvetica-Bold", 14)
    c.drawCentredString(300, 750, custom_title)
    c.setFont("Helvetica", 12)
    right_x = 550
    c.drawRightString(right_x, 680, f"Course: {course_name}")
    c.drawRightString(right_x, 665, f"Section: {section}")
    c.drawRightString(right_x, 650, f"Total Marks: {total_marks}")
    c.drawString(50, 680, f"Name: {student_name}")
    c.drawString(50, 665, f"Reg No: {reg_no}")
    c.drawString(50, 650, f"Set No: {set_no}")
    c.line(50, 640, 550, 640)
    y = 620
    line_height = 18
    max_width = 500

    for i, question in enumerate(questions, 1):
        parts = re.split(r"(\([a-z]\)|[A-Z]\.)", question)
        main_text = parts[0].strip()
        text_object = c.beginText(50, y)
        text_object.setFont("Helvetica-Bold", 12)
        text_object.textLine(f"{i}. ")
        text_object.setFont("Helvetica", 12)
        words = main_text.split()
        current_line = ""
        for word in words:
            test_line = current_line + word + " "
            if c.stringWidth(test_line, "Helvetica", 12) < max_width:
                current_line = test_line
            else:
                text_object.textLine(current_line)
                current_line = word + " "
                y -= line_height
                if y < 50:
                    c.drawText(text_object)
                    c.showPage()
                    y = 750
                    text_object = c.beginText(50, y)
                    text_object.setFont("Helvetica-Bold", 12)
                    text_object.textLine(f"{i}. ")
                    text_object.setFont("Helvetica", 12)
        if current_line:
            text_object.textLine(current_line)
            y -= line_height
        c.drawText(text_object)

        if len(parts) > 1:
            for j in range(1, len(parts), 2):
                option_marker = parts[j].strip()
                option_text = parts[j + 1].strip() if j + 1 < len(parts) else ""
                y -= line_height
                if y < 50:
                    c.showPage()
                    y = 750
                text_object = c.beginText(70, y)
                text_object.setFont("Helvetica", 12)
                option_line = f"{option_marker} {option_text}"
                words = option_line.split()
                current_line = ""
                for word in words:
                    test_line = current_line + word + " "
                    if c.stringWidth(test_line, "Helvetica", 12) < (max_width - 20):
                        current_line = test_line
                    else:
                        text_object.textLine(current_line)
                        current_line = word + " "
                        y -= line_height
                        if y < 50:
                            c.drawText(text_object)
                            c.showPage()
                            y = 750
                            text_object = c.beginText(70, y)
                            text_object.setFont("Helvetica", 12)
                if current_line:
                    text_object.textLine(current_line)
                    y -= line_height
                c.drawText(text_object)
        y -= 15
        if y < 50:
            c.showPage()
            y = 750

    c.setFont("Helvetica", 10)
    c.drawString(50, 40, f"End of Paper - Total Questions: {len(questions)}")
    c.showPage()
    c.save()

@app.get("/")
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/upload-and-generate/")
async def upload_and_generate(
    files: List[UploadFile] = File(...),
    student_count: int = Form(...),
    questions_per_bank: int = Form(...),
    student_names_file: Optional[UploadFile] = File(None),
    zip_download: bool = Form(False),
    custom_title: str = Form("Class 10 Examination Paper"),
    course_name: str = Form("Mathematics"),
    section: str = Form("A"),
    total_marks: int = Form(100)
):
    question_banks = []
    for file in files:
        if file.filename.endswith(".pdf"):
            questions = extract_text_from_pdf(file)
        elif file.filename.endswith(".docx"):
            questions = extract_text_from_docx(file)
        elif file.filename.endswith(".txt"):
            questions = extract_text_from_txt(file)
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.filename}")
        logger.info(f"Extracted {len(questions)} questions from {file.filename}")
        question_banks.append(questions)

    student_details = []
    if student_names_file:
        temp_file_path = f"temp_{student_names_file.filename}"
        with open(temp_file_path, "wb") as temp_file:
            shutil.copyfileobj(student_names_file.file, temp_file)
        
        try:
            if student_names_file.filename.endswith((".csv", ".txt")):
                df = pd.read_csv(temp_file_path)
            elif student_names_file.filename.endswith(".xlsx"):
                df = pd.read_excel(temp_file_path)
            else:
                raise HTTPException(status_code=400, detail="Unsupported student file type. Use .csv, .txt, or .xlsx")
            
            required_columns = ["name", "reg_no"]
            if not all(col.lower() in [c.lower() for c in df.columns] for col in required_columns):
                raise HTTPException(status_code=400, detail=f"Student file must contain columns: {required_columns}")
            
            student_details = df[["name", "reg_no"]].dropna().to_dict("records")
            if len(student_details) < student_count:
                raise HTTPException(status_code=400, detail=f"Not enough student records provided. Need at least {student_count}, got {len(student_details)}")
        finally:
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
    else:
        student_details = [{"name": f"Student {i+1}", "reg_no": f"{i+1:03d}"} for i in range(student_count)]
    logger.info(f"Student details: {student_details}")

    number_of_banks = len(question_banks)
    questions_per_student = questions_per_bank * number_of_banks
    total_questions_needed = student_count * questions_per_student
    for i, bank in enumerate(question_banks):
        if len(bank) < questions_per_bank:
            raise HTTPException(
                status_code=400,
                detail=f"Not enough questions in bank {i+1}! Need {questions_per_bank} per student, but only {len(bank)} available."
            )
        if len(bank) < questions_per_bank * student_count:
            logger.warning(f"Bank {i+1} has {len(bank)} questions, but {questions_per_bank * student_count} unique questions are needed. Some questions will be reused.")

    assignments = {}
    used_questions_per_bank = [set() for _ in range(number_of_banks)]
    unique_sets = {}
    
    for i in range(student_count):
        student_name = f"Student_{i+1}"
        assignments[student_name] = []
        
        for bank_idx, bank in enumerate(question_banks):
            available_questions = [q for idx, q in enumerate(bank) if idx not in used_questions_per_bank[bank_idx]]
            if len(available_questions) < questions_per_bank:
                used_questions_per_bank[bank_idx].clear()
                available_questions = bank.copy()
            
            shuffled_questions = shuffle_array(available_questions)
            selected = shuffled_questions[:questions_per_bank]
            
            for question in selected:
                question_idx = bank.index(question)
                used_questions_per_bank[bank_idx].add(question_idx)
            
            assignments[student_name].extend(selected)
        
        assignments[student_name] = [validate_and_complete_question(q) for q in assignments[student_name]]
        unique_sets[student_name] = assignments[student_name].copy()
        logger.info(f"Generated unique set for {student_name}: {assignments[student_name]}")

    # Store PDFs and collect download links
    pdf_links = {}
    base_path = Path("C:/Users/rashi/OneDrive/Desktop/classConnect/pdfs")  # Exact path you provided
    logger.info(f"Base path set to: {base_path}")  # Debug log
    for i, student in enumerate(student_details):
        student_name = student["name"]
        reg_no = student["reg_no"]
        set_no = f"Set {min(i + 1, student_count)}"
        if i < student_count:
            assignments[student_name] = unique_sets[f"Student_{i+1}"].copy()
        else:
            random_set_key = random.choice(list(unique_sets.keys()))
            assignments[student_name] = unique_sets[random_set_key].copy()
            set_no = f"Set {int(random_set_key.split('_')[1])}"
        logger.info(f"Assigned to {student_name} (Reg No: {reg_no}, Set: {set_no}): {assignments[student_name]}")

        output_path = base_path / f"{reg_no}.pdf"
        logger.info(f"Saving PDF to: {output_path}")  # Debug log
        output_path.parent.mkdir(parents=True, exist_ok=True)
        generate_pdf(student_name, reg_no, set_no, custom_title, course_name, section, total_marks, assignments[student_name], str(output_path))

        # Store link to the PDF
        pdf_links[reg_no] = f"/get-pdf/{reg_no}"

    zip_link = None
    if zip_download and len(student_details) > 1:
        zip_path = base_path / "student_questions.zip"
        with zipfile.ZipFile(zip_path, 'w') as zf:
            for reg_no in [student["reg_no"] for student in student_details]:
                pdf_path = base_path / f"{reg_no}.pdf"
                zf.write(pdf_path, f"{reg_no}.pdf")
        logger.info(f"Generated ZIP: {zip_path}")
        zip_link = "/get-zip"

    # Return JSON with download links
    return JSONResponse(content={
        "message": "PDFs generated successfully",
        "pdf_links": pdf_links,
        "zip_link": zip_link
    })

@app.get("/get-pdf/{reg_no}")
async def get_pdf(reg_no: str):
    base_path = Path("C:/Users/rashi/OneDrive/Desktop/classConnect/pdfs")
    pdf_path = base_path / f"{reg_no}.pdf"
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="PDF not found for roll number")
    return FileResponse(pdf_path, media_type='application/pdf', filename=f"{reg_no}.pdf")

@app.get("/get-zip")
async def get_zip():
    base_path = Path("C:/Users/rashi/OneDrive/Desktop/classConnect/pdfs")
    zip_path = base_path / "student_questions.zip"
    if not zip_path.exists():
        raise HTTPException(status_code=404, detail="ZIP file not found")
    return FileResponse(zip_path, media_type='application/zip', filename="student_questions.zip")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)