const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  roll: String,
  name: String,
  pdfPath: String, // Optional: keeps the path for reference or fallback
  pdfData: Buffer, // Store PDF binary data
  answerPdf: String
});

const classSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  icon: { type: String, default: '📚' },
  assignments: { type: Number, default: 0 },
  lastActive: { type: String, default: () => new Date().toLocaleString() },
  students: [studentSchema]
});

module.exports = mongoose.model('Class', classSchema);