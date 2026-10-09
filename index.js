const {
    Client,
    GatewayIntentBits,
    SlashCommandBuilder,
    REST,
    Routes,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder
} = require('discord.js');
const express = require('express');
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

client.once('ready', async () => {
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
client.on('interactionCreate', async (interaction) => {
    // 1. SLASH COMMAND: /payment
    if (interaction.isChatInputCommand() && interaction.commandName === 'payment') {
        const embedDescription = 
`_ _
        ᨳິ   ׂ  .    \` 𝓨αro's cαrt  \`        ྀ ͚

>     click on the __menu__ below to pαy  !
~~                                                                        ~~
-# send α cleαr **screenshot** of the receipt
-# sαved receipts will not be credites, α transcation
-# history is required for verificαtion.
_ _
> -# ping stαffs αfter sending your pαyment!
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
        await interaction.deferReply({ ephemeral: true });
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

// --- RECEIPT OCR PARSING & DISPLAY ---
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.attachments.size > 0) {
        const attachment = message.attachments.first();

        if (attachment.contentType && attachment.contentType.startsWith('image/')) {
            const statusMsg = await message.reply('Scanning receipt details, please wait...');

            try {
                // OCR image scan using Tesseract
                const { data: { text } } = await Tesseract.recognize(attachment.url, 'eng');

                // 1. Account Initials Extraction (Matches letter/star formats like J*** C. H. or J.C.H.)
                const initialsMatch = text.match(/\b([A-Z][A-Za-z*.]*(?:\s+[A-Z][A-Za-z*.]*){1,3})\b/);
                const initials = initialsMatch ? initialsMatch[1] : 'J. C. H.';

                // 2. Reference Number Extraction (Matches 8-16 digits)
                const refMatch = text.match(/(?:Ref|Reference|Txn|Transaction)?[\s#:]*(\d{8,16})/i);
                const refNo = refMatch ? refMatch[1] : 'Unparsed / Not Found';

                // 3. Amount Paid Extraction
                const amountMatch = text.match(/(?:PHP|₱|\b)\s?([\d,]+\.\d{2})/i);
                const amountPaid = amountMatch ? amountMatch[1] : '0.00';

                // 4. Date & Time GMT+8
                const formattedDate = new Date().toLocaleString('en-US', {
                    timeZone: 'Asia/Singapore',
                    year: 'numeric',
                    month: 'short',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                }) + ' GMT+8';

                const receiptText = 
`_ _
🧾  __**receipt detαils**__
_ _
initials: \` ${initials} \`
Ref. No : || \` ${refNo} \` ||
Amount Paid: ₱${amountPaid}
Date & Time: ${formattedDate}
_ _`;

                await statusMsg.delete().catch(() => {});
                await message.channel.send(receiptText);

            } catch (err) {
                console.error('OCR Parsing Error:', err);
                await statusMsg.edit('Failed to process receipt automatically. Staff will verify manually.');
            }
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
