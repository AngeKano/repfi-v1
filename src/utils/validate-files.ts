// Accepte images (jpeg/jpg/png/webp), pdf, word, excel, mae et formats apparentés
export const isValidFile = (file: File) => {
  // Basé sur l'attribut accept
  // .png,.jpeg,.jpg,.webp,.pdf,.doc,.docx,.xls,.xlsx,.mae,
  // application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,
  // application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,
  // application/pdf,image/png,image/jpeg,image/jpg,image/webp

  const validMimeTypes = [
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
  ];

  const validExtensions = [
    ".png",
    ".jpeg",
    ".jpg",
    ".webp",
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".mae",
  ];

  const fileNameLower = file.name.toLowerCase();

  // Vérifie le mimeType
  if (validMimeTypes.includes(file.type)) {
    return true;
  }

  // Vérifie l'extension
  return validExtensions.some((ext) => fileNameLower.endsWith(ext));
};
