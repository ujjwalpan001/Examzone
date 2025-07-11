📚 AI-Powered Online Assessment System
An end-to-end intelligent exam platform with AI-generated questions, secure student attempts, automated evaluation, results management, and analytics.

🔧 Tech Stack
Backend
Python (FastAPI / Flask)
OpenAI GPT-4 (Question Generation)
MongoDB / PostgreSQL

Frontend
React.js / Vue.js / Next.js
Teacher & Student Dashboards
Security & Upload
Visibility & Fullscreen APIs
WebRTC (Proctoring)
Google Drive API / Multer
Evaluation

OCR: Tesseract, PyTesseract

NLP: Hugging Face, spaCy, NLTK

Image Marking: OpenCV, PIL

PDF Generation: ReportLab / FPDF

Results & Analytics
Google Sheets API
Matplotlib, Plotly
pandas, NumPy

🔐 Modules & Workflows
1️⃣ Teacher Panel
📄 Question Creation
Upload base question

Choose type, difficulty, AI features

System uses GPT-4 to generate variations

Teacher reviews generated questions

✅ Review & Assign
View/edit/delete generated questions
Assign to student groups
Save to DB and move to distribution

📤 Security & Distribution
Security: Tab switching & fullscreen lock
Distribution Modes:
Print Mode: PDF with student ID and name
Soft Copy: Delivered via dashboard

2️⃣ Student Panel
🔒 Secure Attempt
Screen lock, tab switch warning
Repeated tab switch → auto-question change
Write answers on paper
Scan & upload within set time
Final submission is locked

3️⃣ AI-Based Evaluation
OCR extracts handwritten text
AI compares with model answer
Answer sheet annotated:
✅ Correct
❌ Wrong
🔵 Partial mistakes
Feedback auto-generated
Marked sheet shared with student

4️⃣ Results Management
Scores + feedback compiled
Stored in DB and Google Sheets
PDF result reports auto-generated
Students notified via email
Teacher summary report

5️⃣ Analytics Dashboard
Student performance trends
Common mistakes & topic-wise analysis
Visualizations: charts, graphs
Displayed on Teacher Dashboard

🧪 Teacher Dashboard Pages
Question Creation Page
Review & Assign Page
Security & Distribution Page

🚀 Project Highlights
AI-generated & randomized questions
Screen-lock & anti-cheat features
OCR-based evaluation with feedback
Auto-result publishing + email alerts
Performance analytics for teachers
