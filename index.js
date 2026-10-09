const {
    Client,
    GatewayIntentBits,
    SlashCommandBuilder,
    REST,
    Routes,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    MessageFlags,
    Events
} = require('discord.js');
const express = require('express');
const axios = require('axios');
const Tesseract = require('tesseract.js');
require('dotenv').config();

// --- HTTP SERVER FOR RENDER KEEP-ALIVE ---
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send({ status: 'ok', message: 'Payment Bot is running!' }));
app.listen(PORT, '0.0.0.0', () => console.log(`Web server listening on port ${PORT}`));

// Light Gray Color Code
const LIGHT_GRAY = 0xD3D3D3;

// --- DISCORD CLIENT INITIALIZATION ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Slash Command Registration
const commands = [
    new SlashCommandBuilder()
        .setName('payment')
        .setDescription('Send mode of payment message')
].map(cmd => cmd.toJSON());

client.once(Events.ClientReady, async () => {
    console.log(`Logged in as ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Slash command /payment registered!');
    } catch (err) {
        console.error('Error registering slash commands:', err);
    }
});

// --- INTERACTION HANDLER ---
client.on(Events.InteractionCreate, async (interaction) => {
    // 1. SLASH COMMAND: /payment
    if (interaction.isChatInputCommand() && interaction.commandName === 'payment') {
        const embedDescription = 
`_ _
       ᨳິ    ׂ  .    ` 𝓨αro's cαrt  `       ྀ ͚

>     click on the __button__ below to pαy  !
~~                                                                            ~~
-# send α cleαr **screenshot** of the receipt
-# sαved receipts will not be credites, α transcation
-# history is required for verificαtion.
_ _
> -# ping <@1558121047046361139>  when sending your receipt!
_ _`;

        const embed = new EmbedBuilder()
            .setColor(LIGHT_GRAY)
            .setDescription(embedDescription);

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('payment_select_menu')
            .setPlaceholder('Select payment option...')
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('GCash')
                    .setValue('gcash')
                    .setDescription('Pay using GCash'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('BPI')
                    .setValue('bpi')
                    .setDescription('Pay using BPI')
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        // Acknowledge interaction ephemerally then send non-reply embed into the channel
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.editReply({ content: 'Payment menu posted to the channel!' });
    }

    // 2. SELECT MENU SELECTION
    if (interaction.isStringSelectMenu() && interaction.customId === 'payment_select_menu') {
        const selectedValue = interaction.values[0];

        if (selectedValue === 'gcash') {
            const gcashEmbed = new EmbedBuilder()
                .setColor(LIGHT_GRAY)
                .setDescription(
`_ _
   𓏵 𓏼   gcαsh pαyment detαils:

>          \` 0906 578 6164 \` 
>                 ||   J. C. H.   ||
_ _
> -# qr code provided for your convenience !
_ _`
                )
                .setImage('https://cdn.discordapp.com/attachments/1554676961241202698/1557952876423155742/IMG_20261009_110756.jpg?ex=6ac9ac2f&is=6ac85aaf&hm=2672cf36f6aeaa7b8895a1dd04f614c06d33d3e92a529aafe060a628a92c66d9');

            await interaction.reply({ embeds: [gcashEmbed] });
        } else if (selectedValue === 'bpi') {
            const bpiEmbed = new EmbedBuilder()
                .setColor(LIGHT_GRAY)
                .setDescription(
`_ _
   𓏵 𓏼   bpi pαyment detαils:

>          \` scan qr code below \` 
>                     ||   J. C. H.   ||
_ _
> -# qr code provided for your convenience !
_ _`
                )
                .setImage('https://cdn.discordapp.com/attachments/1554676961241202698/1558074818618859580/Messenger_creation_1813956912925084.jpg?ex=6aca1dc0&is=6ac8cc40&hm=f15fdf357170820c5ef923f6bece2b2be7926f84c9cc36ebee2bcaf80c32d1e4');

            await interaction.reply({ embeds: [bpiEmbed] });
        }
    }
});

// --- RECEIPT OCR PARSING & EMBED DISPLAY ---
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    // RESTRICTION: Only run OCR if the bot is tagged (@Bot) AND an image is attached
    const isBotMentioned = message.mentions.has(client.user.id);
    const attachment = message.attachments.first();

    if (isBotMentioned && attachment && attachment.contentType && attachment.contentType.startsWith('image/')) {
        const statusMsg = await message.reply('Scanning receipt details, please wait...');

        try {
            // 1. Download image buffer via Axios (bypasses Render/CDN restrictions)
            const response = await axios.get(attachment.url, { responseType: 'arraybuffer' });
            const imageBuffer = Buffer.from(response.data);

            // 2. OCR image scan using Tesseract
            const { data: { text } } = await Tesseract.recognize(imageBuffer, 'eng');

            // 3. Extract Initials / Masked Name (Matches "JL••••A CH••••••E H.", "J... C. H.", or plain text)
            const initialsMatch = text.match(/\b([A-Za-z•.*]{1,10}(?:\s+[A-Za-z•.*]{1,10}){1,4})\b/);
            let initials = 'J. C. H.';
            if (initialsMatch) {
                initials = initialsMatch[1].replace(/\s+/g, ' ').trim();
            }

            // 4. Extract Reference Number (Handles spaced GCash refs like "7045 933 602607")
            const refPatterns = [
                /(?:Ref\s*No\.|Reference\s*No\.|Ref\.|Transaction\s*No\.|Txn\s*ID|Control\s*No\.)\s*[:#-]?\s*([0-9\s]{10,20})/i,
                /\b(\d{4}\s?\d{3}\s?\d{6})\b/,             // Spaced GCash 13-digit format
                /\b\d{13}\b/,                             // Continuous 13-digit GCash
                /\b00\d{10,12}\b/,                        // GCash starting with 00
                /\b[a-z0-9]{8,18}\b/i                    // Maya / GoTyme / BPI refs
            ];

            let refNo = 'Unparsed / Not Found';
            for (const pattern of refPatterns) {
                const match = text.match(pattern);
                if (match) {
                    const rawRef = match[1] || match[0];
                    // Strip inner spaces to ensure clean reference number output
                    refNo = rawRef.replace(/\s+/g, '').trim();
                    break;
                }
            }

            // 5. Extract Amount Paid
            const amountMatch = text.match(/(?:Total\s*Amount\s*Sent|Amount|Total|Paid|₱|PHP)\s*[:#-]?\s*(?:PHP|P|₱)?\s*([\d,]+\.\d{2})/i) 
                               || text.match(/\b([\d,]+\.\d{2})\b/);
            const amountPaid = amountMatch ? amountMatch[1] : '0.00';

            // 6. Format Date & Time GMT+8
            const formattedDate = new Date().toLocaleString('en-US', {
                timeZone: 'Asia/Singapore',
                year: 'numeric',
                month: 'short',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            }) + ' GMT+8';

            // Embed Description Layout
            const receiptEmbedDescription = 
`_ _
🧾  __**receipt detαils**__
_ _
initials: \` ${initials} \`
Ref. No : || \` ${refNo} \` ||
Amount Paid: ₱${amountPaid}
Date & Time: ${formattedDate}
_ _`;

            // Build Light Gray Embed
            const receiptEmbed = new EmbedBuilder()
                .setColor(LIGHT_GRAY)
                .setDescription(receiptEmbedDescription);

            // Remove status message and send embed
            await statusMsg.delete().catch(() => {});
            await message.channel.send({ embeds: [receiptEmbed] });

        } catch (err) {
            console.error('OCR Parsing Error:', err);
            await statusMsg.edit('Failed to process receipt automatically. Staff will verify manually.');
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
