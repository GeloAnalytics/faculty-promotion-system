import type { EmployeeUploadWorkflowItem } from './types';

export const employeeUploadWorkflow: EmployeeUploadWorkflowItem[] = [
  {
    type: 'score-sheet',
    title: 'Score Sheet',
    description: 'Upload one PDF or scanned image that contains the scores for each KRA and criterion.',
    acceptedFormats: ['pdf', 'png', 'jpg', 'jpeg', 'bmp', 'tif', 'tiff'],
    maxFiles: 1,
    helperText: 'This should be the main scoring sheet only. OCR will read the numbers and compare them with the evidence.',
    uploadNotes: [
      'One file only.',
      'Prefer a clean PDF if possible.',
      'The document should show the criterion names and their corresponding scores.',
    ],
  },
  {
    type: 'evidence',
    title: 'Evidence Documents',
    description: 'Upload the supporting evidence files that justify the score sheet values.',
    acceptedFormats: ['pdf', 'png', 'jpg', 'jpeg', 'bmp', 'tif', 'tiff'],
    maxFiles: 10,
    helperText: 'Use clear file names and upload only documents that support the KRA entries. The system will auto-check the OCR output.',
    uploadNotes: [
      'Up to ten files per submission.',
      'Each file must be a PDF or image.',
      'Keep each document focused on one evidence item for easier OCR matching.',
    ],
  },
];

export function getEmployeeUploadWorkflowSummary() {
  return employeeUploadWorkflow.map((item) => ({
    ...item,
  }));
}
