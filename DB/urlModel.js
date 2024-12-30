import { model, Schema } from "mongoose";

const analyticsSchema = new Schema({
    ipAddress: String,
    timestamp: { type: Date, default: Date.now() },
  });

const URLSchema = new Schema({
    originalURL: {
        type: String,
        required: true
    },
    shortId: {
        type: String,
        required: true,
        unique: true
    },
    expiresAt: Date, // Optional
    analytics: [analyticsSchema], // analytics schema
    visitCount: { type: Number, default: 0 }, // number of visits
},
    { timestamps: true }
)

export const URLModel = model('URL', URLSchema)