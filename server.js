const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const fs = require('fs');
const path = require('path');
const Class = require('./models/Class');
const session = require('express-session');
const app = express();
const PORT = 3000;
app.set('view engine', 'ejs');
const axios = require('axios');


// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/pdfs', express.static(path.join(__dirname, 'pdfs')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/answersheets', express.static(path.join(__dirname, 'answersheets'))); // 🔥 Add this!
app.use(session({
  secret: 'yourSecretKey123', // use a strong secret in production
  resave: false,
  saveUninitialized: true
}));



mongoose.connect('mongodb://localhost:27017/classDB', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));


  // Ensure folders exist (only for answer sheets)
['answersheets'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});
// Ensure folders exist
['uploads', 'pdfs', 'answersheets'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

// Multer for PDF roll number upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// Multer for answer sheet upload
const answerStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'answersheets/'),
  filename: (req, file, cb) => cb(null, `${req.body.roll}_${Date.now()}.pdf`)
});
const answerUpload = multer({ storage: answerStorage });

// Routes

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/student-interface', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'student-interface.html'));
  next()
});
app.get('/setup_examT.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'setup_examT.html'));
  next()
});
app.get('/set', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'teacher-interface.html'));
});

app.get('/create-class', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'create-class.html'));
});

// Serve the login page
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/upload', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'upload.html'));
});

app.get('/student', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'student.html'));
});

app.get('/upload-answer', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'upload-answer.html'));
});

app.get('/get-answers', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'get-answers.html'));
});

// Serve teacher dashboard
app.get('/teacher-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'teacher-dashboard.html'));
});
app.get('/teacher-login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'teacher-login.html'));
});
app.get('/original/QA/templates/index', (req, res) => {
  res.sendFile(path.join(__dirname, '/original/QA/templates', 'index.html'));
});
app.get('/student-login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'student-login.html'));
});

// Serve student dashboard
app.get('/student-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'student-dashboard.html'));
});

// Handle login form submission
app.post('/login', (req, res) => {
  const { email, password, role } = req.body;

  // For now, we skip real auth and just log info
  console.log(`📥 Login attempt - Email: ${email}, Role: ${role}`);

  if (role === 'teacher') {
    return res.redirect('/teacher-login');
  } else if (role === 'student') {
    return res.redirect('/student-login');
  } else {
    return res.status(400).send("❌ Invalid role selected.");
  }
});
// New route to fetch PDF from FastAPI and store in database
app.post('/generate-pdf', async (req, res) => {
  const { classCode, roll } = req.body;

  if (!classCode || !roll) {
    return res.status(400).json({ success: false, message: 'Class code and roll number are required.' });
  }

  try {
    let classDoc = await Class.findOne({ code: classCode });
    if (!classDoc) {
      return res.status(404).json({ success: false, message: 'Class not found.' });
    }

    let student = classDoc.students.find(s => s.roll === roll);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    // Fetch PDF from FastAPI
    const fastApiUrl = 'http://localhost:8000/upload-and-generate/'; // Adjust to your FastAPI server URL
    const formData = new FormData();

    // Mock payload for FastAPI (adjust based on your FastAPI requirements)
    formData.append('student_count', 1);
    formData.append('questions_per_bank', 5); // Example value
    formData.append('custom_title', 'Class Exam');
    formData.append('course_name', 'Mathematics');
    formData.append('section', 'A');
    formData.append('total_marks', 100);

    // Mock student details
    const studentDetails = JSON.stringify([{ name: student.name || `Student_${roll}`, reg_no: roll }]);
    const blob = new Blob([studentDetails], { type: 'application/json' });
    formData.append('student_names_file', blob, 'students.json');

    // Mock question bank (replace with actual file if available)
    const sampleQuestions = "1. What is 2+2?\n2. Solve x^2 = 16\n3. Define probability\n4. Calculate 5!\n5. What is a vector?";
    const questionsBlob = new Blob([sampleQuestions], { type: 'text/plain' });
    formData.append('files', questionsBlob, 'questions.txt');

    const response = await axios.get(`http://localhost:8000/get-pdf/${roll}`, {
      responseType: 'arraybuffer'
    });
    // Store PDF as binary in database
    const pdfBuffer = Buffer.from(response.data);
    student.pdfData = pdfBuffer; // Save binary data
    student.pdfPath = `/pdfs/${roll}.pdf`; // Optional: keep path for reference
    await classDoc.save();

    console.log(`✅ PDF stored in database for roll ${roll}`);
    return res.json({
      success: true,
      message: 'PDF stored in database successfully!',
      pdfUrl: `/get-pdf?classCode=${classCode}&roll=${roll}` // Endpoint to retrieve PDF
    });
  } catch (error) {
    console.error('❌ Error fetching or storing PDF:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch or store PDF.' });
  }
});

// New route to retrieve PDF from database
app.get('/get-pdf', async (req, res) => {
  const { classCode, roll } = req.query;

  if (!classCode || !roll) {
    return res.status(400).send('Class code and roll number are required.');
  }

  try {
    const classDoc = await Class.findOne({ code: classCode });
    if (!classDoc) {
      return res.status(404).send('Class not found.');
    }

    const student = classDoc.students.find(s => s.roll === roll);
    if (!student || !student.pdfData) {
      return res.status(404).send('PDF not found for this student.');
    }

    // Set response headers for PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${roll}.pdf"`);
    res.send(student.pdfData); // Stream PDF binary data
  } catch (error) {
    console.error('❌ Error retrieving PDF:', error);
    res.status(500).send('Server error.');
  }
});

// Update /student route to use the database-stored PDF
app.post('/student', async (req, res) => {
  const { classCode, roll } = req.body;

  try {
    const classDoc = await Class.findOne({ code: classCode });
    if (!classDoc) return res.status(404).send("❌ Class not found");

    const student = classDoc.students.find(s => s.roll === roll);
    if (!student) return res.status(404).send("❌ Student not found");

    if (!student.pdfData) {
      return res.status(404).send("❌ PDF not generated yet. Please generate the PDF first.");
    }

    res.send(`✅ <a href="/get-pdf?classCode=${classCode}&roll=${roll}" target="_blank">${roll}.pdf</a>`);
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).send("❌ Server error");
  }
});


// app.post('/create-class', async (req, res) => {
//   const { code } = req.body;

//   if (!code) return res.status(400).send("❌ Class code is required.");

//   try {
//     const existing = await Class.findOne({ code });
//     if (existing) return res.send("⚠️ Class already exists!");

//     await new Class({ code, students: [] }).save();
//     res.send("✅ Class created successfully!");
//   } catch (err) {
//     console.error(err);
//     res.status(500).send("❌ Server error");
//   }
// });
// ✅ Silently create class and return nothing (just status 204)
app.post('/create-class', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Class code is required' });

  try {
    const existing = await Class.findOne({ code });
    if (existing) return res.status(409).json({ error: 'Class already exists' });

    // Derive class title and icon based on code prefix (inspired by student dashboard)
    let title = 'New Subject';
    let icon = '📚';
    if (code.startsWith('PHY')) {
      title = 'Physics';
      icon = '⚛️';
    } else if (code.startsWith('CHEM')) {
      title = 'Chemistry';
      icon = '🧪';
    } else if (code.startsWith('BIO')) {
      title = 'Biology';
      icon = '🧬';
    } else if (code.startsWith('HIST')) {
      title = 'History';
      icon = '🌎';
    } else if (code.startsWith('MATH')) {
      title = 'Mathematics';
      icon = '🧮';
    } else if (code.startsWith('CSE')) {
      title = 'Computer Science';
      icon = '💻';
    }

    const newClass = new Class({
      code,
      title: `${title} - ${code}`,
      description: `New ${title.toLowerCase()} class section`,
      icon,
      students: [],
      assignments: 0,
      lastActive: new Date().toLocaleString()
    });

    await newClass.save();

    res.json({
      icon: newClass.icon,
      title: newClass.title,
      description: newClass.description,
      students: newClass.students.length,
      assignments: newClass.assignments,
      lastActive: newClass.lastActive
    });
  } catch (err) {
    console.error('🚨 Backend error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/join-class', async (req, res) => {
  const { classCode, rollNumber, name } = req.body;

  try {
    const classDoc = await Class.findOne({ code: classCode });

    if (!classDoc) {
      return res.status(404).json({ success: false, message: 'Class not found!' });
    }

    const existingStudent = classDoc.students.find(
      (student) => student.roll === rollNumber
    );

    if (existingStudent) {
      return res.json({ success: true, message: 'You have already joined this class!' });
    }

    classDoc.students.push({
      roll: rollNumber,
      name: name || '',
      pdfPath: `/pdfs/${rollNumber}.pdf`,
      answerPdf: '',
    });

    await classDoc.save();

    res.json({ success: true, message: `Successfully joined class ${classCode}!` });
  } catch (error) {
    console.error('Error joining class:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});


app.post('/upload', upload.single('pdfFile'), async (req, res) => {
  const classCode = req.body.classCode;
  const filePath = req.file.path;

  try {
    const classDoc = await Class.findOne({ code: classCode });
    if (!classDoc) return res.status(404).send("❌ Class not found");

    const data = await pdfParse(fs.readFileSync(filePath));
    const lines = data.text.split('\n');

    const students = lines.map(line => {
      const parts = line.trim().split(/\s+/);
      return {
        roll: parts[0],
        name: parts.slice(1).join(' '),
        pdfPath: `pdfs/${parts[0]}.pdf`
      };
    }).filter(s => s.roll && s.name);

    classDoc.students.push(...students);
    await classDoc.save();

    res.send("✅ Students added successfully!");
  } catch (err) {
    console.error("❌ PDF Error:", err);
    res.status(500).send("❌ Failed to process PDF");
  }
});

// app.post('/student', async (req, res) => {
//   const { classCode, roll } = req.body;

//   try {
//     const classDoc = await Class.findOne({ code: classCode });
//     if (!classDoc) return res.status(404).send("❌ Class not found");

//     const student = classDoc.students.find(s => s.roll === roll);
//     if (!student) return res.status(404).send("❌ Student not found");

//     res.send(`✅ <a href="/${student.pdfPath}" target="_blank">${roll}.pdf</a>`);
//   } catch (err) {
//     console.error("❌ Error:", err);
//     res.status(500).send("❌ Server error");
//   }
// });

app.post('/upload-answer', answerUpload.single('answerSheet'), async (req, res) => {
  const { classCode, roll } = req.body;
  const filePath = `answersheets/${req.file.filename}`;

  try {
    const classDoc = await Class.findOne({ code: classCode });
    if (!classDoc) return res.status(404).send("❌ Class not found");

    const studentIndex = classDoc.students.findIndex(s => s.roll === roll);
    if (studentIndex === -1) return res.status(404).send("❌ Student not found");

    // ✅ Update answerPdf field
    classDoc.students[studentIndex].answerPdf = filePath;
    await classDoc.save();

    console.log(`✅ Answer sheet path saved: ${filePath}`);
    res.send("✅ Answer sheet uploaded and saved successfully!");
  } catch (error) {
    console.error("❌ Upload Error:", error);
    res.status(500).send("Something went wrong while uploading.");
  }
});

app.post('/get-answers', async (req, res) => {
  const { classCode, roll } = req.body;

  try {
    const classDoc = await Class.findOne({ code: classCode });
    if (!classDoc) return res.status(404).send("❌ Class not found");

    let resultHtml = `<h2>📚 Answer Sheets for Class ${classCode}</h2><ul>`;

    if (roll) {
      const student = classDoc.students.find(s => s.roll === roll && s.answerPdf);
      if (!student) return res.send("❌ No answer sheet for this roll number");
      resultHtml += `<li><a href="/${student.answerPdf}" target="_blank">${roll}.pdf</a></li>`;
    } else {
      const submitted = classDoc.students.filter(s => s.answerPdf);
      if (submitted.length === 0) return res.send("❌ No answer sheets submitted yet.");
      submitted.forEach(s => {
        resultHtml += `<li><a href="/${s.answerPdf}" target="_blank">${s.roll}.pdf</a></li>`;
      });
    }

    resultHtml += `</ul><br><a href="/">🔙 Back to Home</a>`;
    res.send(resultHtml);
  } catch (err) {
    console.error("❌ Fetch Error:", err);
    res.status(500).send("❌ Server error");
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
