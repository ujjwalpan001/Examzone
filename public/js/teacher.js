async function createClass() {
    const code = document.getElementById('classCodeCreate').value;
    const res = await fetch('/api/create-class', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    const data = await res.json();
    document.getElementById('createMsg').innerText = data.message;
  }
  
  async function uploadList() {
    const code = document.getElementById('classCodeUpload').value;
    const file = document.getElementById('pdfList').files[0];
    const formData = new FormData();
    formData.append('pdfList', file);
  
    const res = await fetch(`/api/upload-list/${code}`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    document.getElementById('uploadMsg').innerText = data.message;
  }
  