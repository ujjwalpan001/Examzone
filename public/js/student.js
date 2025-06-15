// CLASSCONNECT/public/student.js
document.getElementById('getPdfForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const classCode = document.getElementById('classCode').value;
  const roll = document.getElementById('roll').value;
  const resultDiv = document.getElementById('result');

  resultDiv.innerHTML = '<p>Loading...</p>';

  try {
    // Step 1: Generate and store PDF in database
    const generateResponse = await fetch('/generate-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classCode, roll })
    });

    const generateData = await generateResponse.json();
    if (!generateData.success) {
      resultDiv.innerHTML = `<p style="color: red;">Error: ${generateData.message}</p>`;
      return;
    }

    // Step 2: Display link to download PDF
    resultDiv.innerHTML = `✅ <a href="${generateData.pdfUrl}" target="_blank">${roll}.pdf</a>`;
  } catch (error) {
    console.error('Error:', error);
    resultDiv.innerHTML = '<p style="color: red;">Failed to generate or retrieve PDF.</p>';
  }
});