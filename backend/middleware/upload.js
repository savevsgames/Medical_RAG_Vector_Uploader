import multer from "multer";
import path from "path";

// Configure multer for file uploads
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // ✅ Increased to 50MB for medical documents/scans
  },
  fileFilter: (req, file, cb) => {
    // MIME type validation
    const allowedMimeTypes = [
      // PDF documents
      "application/pdf",
      // Word documents
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
      "application/msword", // ✅ ADD: .doc files
      // Text documents
      "text/plain",
      "text/markdown",
      // ✅ ADD: Common medical document formats
      "application/rtf", // Rich Text Format
      // ✅ ADD: Image formats (for scanned medical documents)
      "image/jpeg",
      "image/png",
      "image/tiff", // Common for medical scans
    ];

    // ✅ ADD: File extension validation (security best practice)
    const allowedExtensions = [
      ".pdf",
      ".docx",
      ".doc",
      ".txt",
      ".md",
      ".rtf",
      ".jpg",
      ".jpeg",
      ".png",
      ".tiff",
      ".tif",
    ];
    const fileExtension = path.extname(file.originalname).toLowerCase();

    // Check both MIME type and extension
    const mimeTypeValid = allowedMimeTypes.includes(file.mimetype);
    const extensionValid = allowedExtensions.includes(fileExtension);

    if (mimeTypeValid && extensionValid) {
      cb(null, true);
    } else {
      const error = !mimeTypeValid
        ? `Invalid MIME type: ${file.mimetype}`
        : `Invalid file extension: ${fileExtension}`;
      cb(
        new Error(
          `${error}. Allowed: PDF, DOC, DOCX, TXT, MD, RTF, JPG, PNG, TIFF`
        ),
        false
      );
    }
  },
});
