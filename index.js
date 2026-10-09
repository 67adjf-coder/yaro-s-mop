const {
    Client,
    GatewayIntentBits,
    SlashCommandBuilder,
    REST,
    Routes,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    AttachmentBuilder,
    MessageFlags,
    Events
} = require('discord.js');
const express = require('express');
const axios = require('axios');
const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// --- HTTP SERVER FOR RENDER KEEP-ALIVE ---
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send({ status: 'ok', message: 'MOP Bot Service is running!' }));
app.listen(PORT, '0.0.0.0', () => console.log(`Web server running on port ${PORT}`));

// --- CONSTANTS & CONFIGURATION ---
const STAFF_ROLE_ID = '1533372358755221566';
const LIGHT_GRAY = 0xD3D3D3;
const PASTEL_GREEN = 0x77DD77;

// Active transactions storage
const activeTransactions = new Map();

// Helper for GMT+8 date/time
function getGMT8Timestamp() {
    return new Date().toLocaleString('en-US', {
        timeZone: 'Asia/Singapore',
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    }) + ' GMT+8';
}

// --- DISCORD CLIENT SETUP ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const commands = [
    new SlashCommandBuilder()
        .setName('mop')
        .setDescription('Generate mode of payment message')
        .addNumberOption(option =>
            option.setName('amount')
                .setDescription('The amount the buyer has to pay')
                .setRequired(true)
        )
].map(cmd => cmd.toJSON());

client.once(Events.ClientReady, async () => {
    console.log(`Logged in as ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Slash commands registered globally!');
    } catch (err) {
        console.error('Error registering commands:', err);
    }
});

// --- INTERACTION HANDLERS ---
client.on(Events.InteractionCreate, async (interaction) => {

    // 1. SLASH COMMAND: /mop
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'mop') {
            if (!interaction.member.roles.cache.has(STAFF_ROLE_ID)) {
                return interaction.reply({ 
                    content: 'Only authorized staff members can run this command.', 
                    flags: MessageFlags.Ephemeral 
                });
            }

            const amount = interaction.options.getNumber('amount');

            const embedContent = 
`_ _
         ** [꒰ mode of payments accepted ꒱](https://coastal-cart.gg)**
~~                                                                        ~~
-# _ _      gcash  ( no fee )      Ი𐑼      go-tyme ( + 10 )     
-# _ _      maya  ( + 10 )        Ი𐑼        paypal ( fnf )
~~                                                                        ~~ 
> -# _ _  send a clear screenshot  of  the  receipt. 
> -# _ _  saved receipts will not be credited,  and 
> -# _ _  a transaction history is required.
~~                                                                        ~~
-# _ _  proceed with payment? click the button below!
_ _`;

            const embed = new EmbedBuilder()
                .setColor(LIGHT_GRAY)
                .setDescription(embedContent);

            const initialBtn = new ButtonBuilder()
                .setCustomId(`mop_start_${amount}`)
                .setEmoji('1555246416115535903')
                .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder().addComponents(initialBtn);

            const response = await interaction.reply({ embeds: [embed], components: [row], withResponse: true });

            activeTransactions.set(response.resource?.message?.id, {
                staffId: interaction.user.id,
                amount: amount,
                buyerId: null,
                paymentType: null,
                tip: 0
            });
        }
    }

    // 2. BUTTON INTERACTIONS
    if (interaction.isButton()) {
        const customId = interaction.customId;

        // Step A: Click initial button
        if (customId.startsWith('mop_start_')) {
            const amount = customId.split('_')[2];

            const btnGcash = new ButtonBuilder()
                .setCustomId(`select_mop_gcash_${amount}`)
                .setLabel('GCash')
                .setStyle(ButtonStyle.Secondary);

            const btnMaya = new ButtonBuilder()
                .setCustomId(`select_mop_maya_${amount}`)
                .setLabel('Maya')
                .setStyle(ButtonStyle.Secondary);

            const btnGoTyme = new ButtonBuilder()
                .setCustomId(`select_mop_gotyme_${amount}`)
                .setLabel('GoTyme')
                .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder().addComponents(btnGcash, btnMaya, btnGoTyme);

            await interaction.reply({
                content: 'Please choose your preferred payment method:',
                components: [row],
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Step B: Select MOP option
        if (customId.startsWith('select_mop_')) {
            const parts = customId.split('_');
            const type = parts[2];
            const amountStr = parts[3];

            const tipYesBtn = new ButtonBuilder()
                .setCustomId(`tip_yes_${type}_${amountStr}`)
                .setLabel('Yes, send a tip!')
                .setStyle(ButtonStyle.Secondary);

            const tipNoBtn = new ButtonBuilder()
                .setCustomId(`tip_no_${type}_${amountStr}`)
                .setLabel('No tip')
                .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder().addComponents(tipYesBtn, tipNoBtn);

            await interaction.update({
                content: `You selected **${type.toUpperCase()}**. Would you like to include a tip?`,
                components: [row]
            });
            return;
        }

        // Step C1: Tip selected = YES -> Open modal
        if (customId.startsWith('tip_yes_')) {
            const parts = customId.split('_');
            const type = parts[2];
            const amountStr = parts[3];

            const modal = new ModalBuilder()
                .setCustomId(`modal_tip_${type}_${amountStr}`)
                .setTitle('Add a Tip');

            const tipInput = new TextInputBuilder()
                .setCustomId('tip_amount_input')
                .setLabel('How much tip would you like to add?')
                .setPlaceholder('e.g. 20')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(tipInput));

            await interaction.showModal(modal);
            return;
        }

        // Step C2: Tip selected = NO -> Send public embed
        if (customId.startsWith('tip_no_')) {
            const parts = customId.split('_');
            const type = parts[2];
            const amountStr = parts[3];
            const totalAmount = parseFloat(amountStr) || 0;

            await interaction.deferUpdate();
            await renderPaymentEmbed(interaction, type, totalAmount, 0);
            return;
        }
    }

    // 3. MODAL SUBMIT (Tip Amount)
    if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('modal_tip_')) {
            const parts = interaction.customId.split('_');
            const type = parts[2];
            const amountStr = parts[3];
            const tipInputVal = interaction.fields.getTextInputValue('tip_amount_input');
            const tipVal = parseFloat(tipInputVal) || 0;
            const totalAmount = (parseFloat(amountStr) || 0) + tipVal;

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            await renderPaymentEmbed(interaction, type, totalAmount, tipVal);
            return;
        }
    }
});

// Helper Function: Sends payment embed publicly in channel
async function renderPaymentEmbed(interaction, type, totalAmount, tipVal) {
    try {
        let titleText = '';
        let accountNo = '';
        let attachment = null;
        let showScanFooter = false;

        if (type === 'gcash') {
            titleText = '𝓖ca**s**h   (  001  )';
            accountNo = '0918  455  2148';
            showScanFooter = true;

            const gcashImagePath = path.join(__dirname, 'assets', 'gcash_qr.png');
            if (fs.existsSync(gcashImagePath)) {
                attachment = new AttachmentBuilder(gcashImagePath, { name: 'qr_code.png' });
            } else {
                console.warn('assets/gcash_qr.png not found!');
                showScanFooter = false;
            }

        } else if (type === 'maya') {
            titleText = '𝓜a**y**a   (  002  )';
            accountNo = '0918  455  2148';

        } else if (type === 'gotyme') {
            titleText = '𝓖oty**m**e   (  003  )';
            accountNo = '0163 8115 1370';
        }

        const footerText = showScanFooter ? '\n-# _ _                **Scan the qr code below!**' : '';

        const embedDescription = 
`_ _
# _ _     ${titleText} 
~~                                                                        ~~
          \`   ${accountNo}   \`
~~                                                                        ~~${footerText}
_ _`;

        const embed = new EmbedBuilder()
            .setColor(LIGHT_GRAY)
            .setDescription(embedDescription);

        if (attachment) {
            embed.setImage('attachment://qr_code.png');
        }

        const tipText = tipVal > 0 ? ` incl. ₱${tipVal} tip` : '';
        const contentMessage = `${interaction.user} Here is your payment details for **${type.toUpperCase()}** (Total: **₱${totalAmount}**${tipText}):`;

        const sendPayload = {
            content: contentMessage,
            embeds: [embed]
        };

        if (attachment) {
            sendPayload.files = [attachment];
        }

        await interaction.channel.send(sendPayload);

        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: 'Payment details posted to the channel!', components: [] });
        } else {
            await interaction.reply({ content: 'Payment details posted to the channel!', flags: MessageFlags.Ephemeral });
        }
    } catch (err) {
        console.error('CRITICAL Error in renderPaymentEmbed:', err);
        const errorMsg = `Failed to display payment details: ${err.message}`;
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: errorMsg, components: [] }).catch(() => {});
        } else {
            await interaction.reply({ content: errorMsg, flags: MessageFlags.Ephemeral }).catch(() => {});
        }
    }
}

// --- RECEIPT OCR & STAFF CONFIRMATION LISTENER ---
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    // 1. RECEIPT OCR EXTRACTION
    if (message.attachments.size > 0) {
        const attachment = message.attachments.first();
        if (attachment.contentType && attachment.contentType.startsWith('image/')) {
            const processingMsg = await message.reply('Processing receipt screenshot, please wait...');

            try {
                // Buffer download for Render compatibility
                const response = await axios.get(attachment.url, { responseType: 'arraybuffer' });
                const imageBuffer = Buffer.from(response.data);

                const { data: { text } } = await Tesseract.recognize(imageBuffer, 'eng');
                
                // 1. Extract Initials / Masked Name (e.g., "JL••••A CH••••••E H.")
                const initialsMatch = text.match(/\b([A-Za-z•.*]{1,10}(?:\s+[A-Za-z•.*]{1,10}){1,4})\b/);
                let initials = 'J. C. H.';
                if (initialsMatch) {
                    initials = initialsMatch[1].replace(/\s+/g, ' ').trim();
                }

                // 2. Extract Reference Number (Handles spaced GCash refs like 7045 933 602607)
                const refPatterns = [
                    /(?:Ref\s*No\.|Reference\s*No\.|Ref\.|Transaction\s*No\.|Txn\s*ID|Control\s*No\.)\s*[:#-]?\s*([0-9\s]{10,20})/i,
                    /\b(\d{4}\s?\d{3}\s?\d{6})\b/,             // 13-digit GCash format with spaces
                    /\b\d{13}\b/,                             // Unspaced 13-digit GCash
                    /\b00\d{10,12}\b/,                        // GCash starting with 00
                    /\b[a-z0-9]{8,18}\b/i                    // Maya / GoTyme alphanumeric refs
                ];

                let refNo = 'Unparsed / Not Found';
                for (const pattern of refPatterns) {
                    const match = text.match(pattern);
                    if (match) {
                        const rawRef = match[1] || match[0];
                        refNo = rawRef.replace(/\s+/g, '').trim();
                        break;
                    }
                }

                // 3. Extract Amount Paid
                let pricePaid = '0.00';
                const amountRegex = /(?:Total\s*Amount\s*Sent|Amount|Total|Paid|php|₱)\s*[:#-]?\s*(?:PHP|P|₱)?\s*([\d,]+(?:\.\d{2})?)/i;
                const priceMatch = text.match(amountRegex) || text.match(/(?:PHP|₱)\s*([\d,]+(?:\.\d{2})?)/i) || text.match(/\b([\d,]+\.\d{2})\b/);

                if (priceMatch) {
                    pricePaid = priceMatch[1].replace(/,/g, '');
                }

                const receiptEmbedDescription = 
`_ _
🧾  __**receipt detαils**__
_ _
initials: \` ${initials} \`
Ref. No : || \` ${refNo} \` ||
Amount Paid: ₱${pricePaid}
Date & Time: ${getGMT8Timestamp()}
_ _`;

                const receiptEmbed = new EmbedBuilder()
                    .setColor(LIGHT_GRAY)
                    .setDescription(receiptEmbedDescription);

                await processingMsg.delete().catch(() => {});
                const embedMsg = await message.channel.send({
                    content: `<@&${STAFF_ROLE_ID}> Please verify payment!`,
                    embeds: [receiptEmbed]
                });

                activeTransactions.set(embedMsg.id, { embedMessage: embedMsg, status: 'pending' });

            } catch (err) {
                console.error('Error parsing screenshot OCR:', err);
                await processingMsg.edit('Could not process screenshot automatically. Staff will review manually.');
            }
        }
    }

    // 2. STAFF CONFIRMATION
    if (message.content.trim().toLowerCase() === 'confirmed' && message.member.roles.cache.has(STAFF_ROLE_ID)) {
        if (message.reference && message.reference.messageId) {
            const targetMessageId = message.reference.messageId;

            try {
                const targetMsg = await message.channel.messages.fetch(targetMessageId);
                if (targetMsg && targetMsg.embeds.length > 0) {
                    const originalEmbed = targetMsg.embeds[0];
                    const updatedEmbed = EmbedBuilder.from(originalEmbed).setColor(PASTEL_GREEN);

                    await targetMsg.edit({ embeds: [updatedEmbed] });
                    await message.reply(
`_ _
payment received. thank you!
_ _`
                    );
                }
            } catch (err) {
                console.error('Error confirming payment embed:', err);
            }
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
