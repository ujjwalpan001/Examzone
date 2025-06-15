document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('uploadForm');
    const resultDiv = document.getElementById('result');
    const downloadSection = document.getElementById('downloadSection');

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        
        // Show loading state
        resultDiv.innerHTML = '<p class="loading">Generating PDFs... Please wait.</p>';
        downloadSection.style.display = 'none';

        try {
            const response = await fetch('/upload-and-generate/', {
                method: 'POST',
                body: new FormData(form)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Server error');
            }

            const data = await response.json();
            displayResults(data);
            
        } catch (error) {
            resultDiv.innerHTML = `<p class="error">Error: ${error.message}</p>`;
            console.error('Submission error:', error);
        }
    });

    function displayResults(data) {
        resultDiv.innerHTML = '';
        downloadSection.style.display = 'block';
        
        // Clear previous download links
        const downloadLinks = document.getElementById('downloadLinks');
        downloadLinks.innerHTML = '';
        
        // Add individual PDF links
        for (const [name, url] of Object.entries(data.pdf_links)) {
            const link = document.createElement('a');
            link.href = url;
            link.textContent = `Download ${name}.pdf`;
            link.className = 'pdf-link';
            link.target = '_blank';
            downloadLinks.appendChild(link);
            downloadLinks.appendChild(document.createElement('br'));
        }

        // Configure ZIP download button
        const zipBtn = document.getElementById('downloadZipBtn');
        if (data.zip_link) {
            zipBtn.style.display = 'inline-block';
            zipBtn.onclick = () => window.location.href = data.zip_link;
        } else {
            zipBtn.style.display = 'none';
        }
    }
});