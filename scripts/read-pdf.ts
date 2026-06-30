import fs from 'fs';
import pdf from 'pdf-parse';

async function readPdf() {
    try {
        const dataBuffer = fs.readFileSync('dist/List of Documentary Evidences.pdf');
        const data = await pdf(dataBuffer);
        console.log(data.text);
    } catch (error) {
        console.error('Error reading PDF:', error);
    }
}

readPdf();
