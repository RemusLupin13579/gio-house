// /api/avatar/[userId].js
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
    try {
        const userId = String(req.query.userId || "").trim();
        if (!userId) return res.status(400).json({ error: "NO_USER_ID" });

        const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!SUPABASE_URL || !SERVICE_ROLE) {
            return res.status(500).json({ error: "MISSING_SUPABASE_ENV" });
        }

        const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
            auth: { persistSession: false },
        });

        // אנחנו לא יודעים extension מראש (png/jpg/jpeg)
        const candidates = [
            `${userId}/head.png`,
            `${userId}/head.jpg`,
            `${userId}/head.jpeg`,
            `${userId}/avatar.png`,
            `${userId}/avatar.jpg`,
            `${userId}/avatar.jpeg`,
        ];

        let fileData = null;
        let foundPath = null;

        for (const path of candidates) {
            const { data, error } = await admin.storage.from("avatars").download(path);
            if (!error && data) {
                fileData = data;
                foundPath = path;
                break;
            }
        }

        if (!fileData) {
            // fallback ללוגו מקומי/או תשובת 404
            return res.redirect(302, "/pwa-192.png?v=1");
        }

        const arrayBuffer = await fileData.arrayBuffer();
        const buf = Buffer.from(arrayBuffer);

        const lower = foundPath.toLowerCase();
        const contentType =
            lower.endsWith(".png") ? "image/png" :
                (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) ? "image/jpeg" :
                    "application/octet-stream";

        // cache קצר כדי שלא תיתקע על אווטאר ישן
        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
        res.status(200).send(buf);
    } catch (e) {
        console.error("[api/avatar] failed:", e);
        res.status(500).json({ error: "AVATAR_FAILED" });
    }
}
