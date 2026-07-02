/** Validates a Google Drive file/folder ID — alphanumeric + hyphen/underscore, 1–64 chars */
exports.isDriveId = s => typeof s === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(s);
