const ffmpeg = require('fluent-ffmpeg');
const path   = require('path');
const fs     = require('fs');

const MAX_DURATION = parseInt(process.env.MAX_DURATION_SEC || '10');

/**
 * Retourne la durée d'un fichier audio en secondes.
 * @param {string} filePath
 * @returns {Promise<number>}
 */
async function getAudioDuration(filePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) return reject(new Error(`ffprobe échoué: ${err.message}`));
            resolve(metadata.format.duration);
        });
    });
}

/**
 * Convertit un fichier audio en MP3 normalisé et limité en durée.
 * Retourne le chemin du fichier de sortie.
 * @param {string} inputPath  Chemin du fichier source
 * @param {string} outputDir  Répertoire de destination
 * @param {string} basename   Nom de base du fichier de sortie (sans extension)
 * @returns {Promise<{ outputPath: string, duration: number }>}
 */
async function processAudio(inputPath, outputDir, basename) {
    const outputPath = path.join(outputDir, `${basename}.mp3`);

    await new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            // Limiter la durée au maximum autorisé
            .duration(MAX_DURATION)
            // Normaliser le volume avec le filtre loudnorm (EBU R128)
            .audioFilters('loudnorm=I=-16:TP=-1.5:LRA=11')
            // Encoder en MP3 128 kbps mono
            .audioCodec('libmp3lame')
            .audioBitrate('128k')
            .audioChannels(1)
            .toFormat('mp3')
            .on('error', (err) => reject(new Error(`FFmpeg échoué: ${err.message}`)))
            .on('end', resolve)
            .save(outputPath);
    });

    const duration = await getAudioDuration(outputPath);
    return { outputPath, duration };
}

/**
 * Supprime un fichier de manière silencieuse (pas d'erreur si absent).
 * @param {string} filePath
 */
async function removeFile(filePath) {
    try {
        await fs.promises.unlink(filePath);
    } catch {
        // fichier déjà absent, on ignore
    }
}

module.exports = { getAudioDuration, processAudio, removeFile };
