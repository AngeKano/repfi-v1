// Accepte images (jpeg/jpg/png/webp), pdf, word, excel et formats apparentés
export const isValidFile = (file: File) => {
  const validMimeTypes = [
    // Images
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    // PDF
    "application/pdf",
    // Word
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    // Excel
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ];

  const validExtensions = [
    // Images
    ".png",
    ".jpeg",
    ".jpg",
    ".webp",
    // PDF
    ".pdf",
    // Word
    ".doc",
    ".docx",
    // Excel
    ".xls",
    ".xlsx",
  ];

  const fileNameLower = file.name.toLowerCase();

  // Vérifie le mimeType
  if (validMimeTypes.includes(file.type)) {
    return true;
  }

  // Vérifie l'extension
  return validExtensions.some((ext) => fileNameLower.endsWith(ext));
};
