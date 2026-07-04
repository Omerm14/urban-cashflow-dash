/** Validates a Google Drive file/folder ID — alphanumeric + hyphen/underscore, 1–64 chars */
exports.isDriveId = s => typeof s === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(s);

/** Validates a UUID (any version) — used to guard admin routes that take an arbitrary target id */
exports.isUUID = s => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
