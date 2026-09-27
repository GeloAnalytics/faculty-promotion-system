import type { EmployeeUploadWorkflowItem } from './types';

export const employeeUploadWorkflow: EmployeeUploadWorkflowItem[] = [
  {
    type: 'evidence',
    title: 'Evidence Documents',
    description: 'Upload the supporting evidence files that justify the evidence-based draft score, grouped by KRA or criterion when possible.',
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
