export const healthSchema = { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['ok', 'unavailable'] } }, additionalProperties: false };
