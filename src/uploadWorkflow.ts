import type { EmployeeUploadWorkflowItem } from './types';

export const employeeUploadWorkflow: EmployeeUploadWorkflowItem[] = [
  {
    type: 'score-sheet',
    title: 'Score Sheet',
    description: 'Upload one PDF or scanned image that shows the KRA and criterion scores on the summary sheet.',
    acceptedFormats: ['pdf', 'png', 'jpg', 'jpeg', 'bmp', 'tif', 'tiff'],
    maxFiles: 1,
    helperText: 'This should be the main scoring sheet only. OCR will read the KRA or criterion values and compare them with the evidence.',
    uploadNotes: [
      'One file only.',
      'Prefer a clean PDF if possible.',
      'The document should show the KRA and criterion names with their corresponding scores.',
    ],
  },
  {
    type: 'evidence',
    title: 'Evidence Documents',
    description: 'Upload the supporting evidence files that justify the score sheet values, grouped by KRA or criterion when possible.',
    acceptedFormats: ['pdf', 'png', 'jpg', 'jpeg', 'bmp', 'tif', 'tiff'],
    maxFiles: 10,
    helperText: 'Use clear file names and group documents by KRA or criterion. The system will auto-check the OCR output and let you preview PDFs in the portal.',
    uploadNotes: [
      'Up to ten files per submission.',
      'Each file must be a PDF or image.',
      'Keep each document focused on one KRA or criterion evidence item for easier OCR matching.',
    ],
  },
];

export function getEmployeeUploadWorkflowSummary() {
  return employeeUploadWorkflow.map((item) => ({
    ...item,
  }));
}
