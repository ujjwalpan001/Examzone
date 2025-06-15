document.addEventListener('DOMContentLoaded', () => {
    const singleForm = document.getElementById('single-upload-form');
    const dualForm = document.getElementById('dual-upload-form');
    const singleResult = document.getElementById('single-result');
    const dualResult = document.getElementById('dual-result');

    // Handle single file upload
    singleForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        singleResult.innerHTML = 'Processing...';
        singleResult.classList.add('show');

        const formData = new FormData(singleForm);
        try {
            const response = await fetch('/check-answer', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();

            if (data.error) {
                singleResult.innerHTML = `<p class="error">${data.error}</p>`;
            } else {
                let html = '<h3>Results:</h3><ul>';
                data.results.forEach((result, index) => {
                    html += `<li>Question ${index + 1}: ${result.extractedText}<br>Status: ${result.status}<br>Feedback: ${result.feedback}<br>Marks: ${result.marks}</li>`;
                });
                html += `</ul><p>Total Marks: ${data.totalMarks}</p><p><a href="/static/${data.pdfFilename}" target="_blank">Download PDF</a></p>`;
                singleResult.innerHTML = `<div class="success">${html}</div>`;
            }
        } catch (error) {
            singleResult.innerHTML = `<p class="error">Error: ${error.message}</p>`;
        }
    });

    // Handle dual file upload
    dualForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        dualResult.innerHTML = 'Processing...';
        dualResult.classList.add('show');

        const formData = new FormData(dualForm);
        try {
            const response = await fetch('/check-answer-sheets', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();

            if (data.error) {
                dualResult.innerHTML = `<p class="error">${data.error}</p>`;
            } else {
                let html = '<h3>Results:</h3><ul>';
                data.results.forEach((result, index) => {
                    html += `<li>Question ${index + 1}:<br>Question: ${result.questionText}<br>Answer: ${result.extractedText}<br>Status: ${result.status}<br>Feedback: ${result.feedback}<br>Marks: ${result.marks}</li>`;
                });
                html += `</ul><p>Total Marks: ${data.totalMarks}</p><p><a href="/static/${data.pdfFilename}" target="_blank">Download PDF</a></p>`;
                dualResult.innerHTML = `<div class="success">${html}</div>`;
            }
        } catch (error) {
            dualResult.innerHTML = `<p class="error">Error: ${error.message}</p>`;
        }
    });

    // Validate JSON input
    ['single-marks', 'dual-marks'].forEach(id => {
        const input = document.getElementById(id);
        input.addEventListener('input', () => {
            try {
                JSON.parse(input.value);
                input.style.borderColor = '#ccc';
            } catch (e) {
                input.style.borderColor = '#ff0000';
            }
        });
    });
});