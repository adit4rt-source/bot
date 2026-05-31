function getRandomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function shuffleString(str) { let arr = str.split(''); for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr.join(''); }

// Reply with a temporary message that auto-deletes after `ms` milliseconds.
// Falls back to ephemeral if the bot lacks permission to delete messages.
async function replyTemp(interaction, content, ms = 5000) {
    try {
        const msg = await interaction.reply({ content, fetchReply: true });
        setTimeout(() => msg.delete().catch(() => {}), ms);
    } catch (e) {
        // Fallback: ephemeral (can't auto-delete, but at least user sees it)
        try { await interaction.reply({ content, ephemeral: true }); } catch (e2) { /* give up */ }
    }
}

module.exports = { getRandomInt, shuffleString, replyTemp };
