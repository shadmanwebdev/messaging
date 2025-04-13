const express = require('express');
const fs = require('fs');
const https = require('https');
const socketIo = require('socket.io');
const mysql = require('mysql2/promise'); // Add MySQL for database operations

// Create an instance of Express
const app = express();

// SSL options
const options = {
    key: fs.readFileSync('/etc/letsencrypt/live/vps-08e5f5ed.vps.ovh.net/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/vps-08e5f5ed.vps.ovh.net/cert.pem'),
    ca: fs.readFileSync('/etc/letsencrypt/live/vps-08e5f5ed.vps.ovh.net/chain.pem')
};

// Create the HTTPS server
const server = https.createServer(options, app);

// Attach Socket.io to the HTTPS server
const io = socketIo(server, {
    cors: {
        origin: "https://satya.pl",
        methods: ["GET", "POST"]
    }
});

// Database connection pool
const pool = mysql.createPool({
    host: 'localhost',
    user: 'database_user',
    password: 'database_password',
    database: 'your_database'
});

// Store user socket IDs
let userSockets = {};

// Handle WebSocket connections
io.on('connection', async (socket) => {
    console.log('A user connected: ', socket.id);

    // Register user
    socket.on('register_user', (user_id) => {
        userSockets[user_id] = socket.id;
        console.log(`User ${user_id} registered with socket ID ${socket.id}`);
    });

    // Get or create conversation
    socket.on('get_conversation', async (data) => {
        try {
            const connection = await pool.getConnection();
            
            // Check if conversation exists
            let [rows] = await connection.execute(
                'SELECT * FROM conversations WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)',
                [data.current_user_id, data.recipient_id, data.recipient_id, data.current_user_id]
            );
            
            let conversation_id;
            
            if (rows.length === 0) {
                // Create new conversation
                const [result] = await connection.execute(
                    'INSERT INTO conversations (user1_id, user2_id) VALUES (?, ?)',
                    [data.current_user_id, data.recipient_id]
                );
                conversation_id = result.insertId;
            } else {
                conversation_id = rows[0].id;
            }
            
            // Get recipient info
            const [userInfo] = await connection.execute(
                'SELECT username, photo FROM users WHERE id = ?',
                [data.recipient_id]
            );
            
            connection.release();
            
            // Send response back to client
            socket.emit('conversation_created', {
                success: true,
                conversation_id: conversation_id,
                username: userInfo[0].username,
                user_photo: userInfo[0].photo
            });
            
        } catch (error) {
            console.error('Database error:', error);
            socket.emit('conversation_created', {
                success: false,
                error: 'Failed to create conversation'
            });
        }
    });

    // Get messages for a conversation
    socket.on('get_messages', async (data) => {
        try {
            const connection = await pool.getConnection();
            
            // Get messages
            const [messages] = await connection.execute(
                'SELECT m.*, u.username as sender_name, u.photo as sender_photo ' +
                'FROM messages m ' +
                'JOIN users u ON m.sender_id = u.id ' +
                'WHERE m.conversation_id = ? ' +
                'ORDER BY m.sent_at ASC',
                [data.conversation_id]
            );
            
            connection.release();
            
            socket.emit('messages_loaded', {
                success: true,
                messages: messages,
                conversation_id: data.conversation_id
            });
            
        } catch (error) {
            console.error('Database error:', error);
            socket.emit('messages_loaded', {
                success: false,
                error: 'Failed to load messages'
            });
        }
    });

    // Send message
    socket.on('send_message', async (messageData) => {
        try {
            const connection = await pool.getConnection();
            
            // Store message in database
            const [result] = await connection.execute(
                'INSERT INTO messages (conversation_id, sender_id, content, sent_at) VALUES (?, ?, ?, NOW())',
                [messageData.conversation_id, messageData.sender_id, messageData.content]
            );
            
            // Get current timestamp for sent_at
            const [timeResult] = await connection.execute('SELECT NOW() as sent_at');
            const sent_at = timeResult[0].sent_at;
            
            // Get participants in this conversation
            const [participants] = await connection.execute(
                'SELECT user1_id, user2_id FROM conversations WHERE id = ?',
                [messageData.conversation_id]
            );
            
            // Get sender info
            const [senderInfo] = await connection.execute(
                'SELECT username, photo FROM users WHERE id = ?',
                [messageData.sender_id]
            );
            
            connection.release();
            
            // Create complete message object
            const completeMessage = {
                id: result.insertId,
                conversation_id: messageData.conversation_id,
                sender_id: messageData.sender_id,
                sender_name: senderInfo[0].username,
                sender_photo: senderInfo[0].photo,
                content: messageData.content,
                sent_at: sent_at
            };
            
            // Notify sender of success
            socket.emit('message_sent', {
                success: true,
                message: completeMessage
            });
            
            // Notify all participants
            const participantIds = [participants[0].user1_id, participants[0].user2_id];
            participantIds.forEach(participant_id => {
                if (participant_id != messageData.sender_id && userSockets[participant_id]) {
                    io.to(userSockets[participant_id]).emit('receive_message', completeMessage);
                }
            });
            
        } catch (error) {
            console.error('Database error:', error);
            socket.emit('message_sent', {
                success: false,
                error: 'Failed to send message'
            });
        }
    });

    // Typing indicator
    socket.on('typing', async (data) => {
        try {
            const connection = await pool.getConnection();
            
            // Get the other participant
            const [participants] = await connection.execute(
                'SELECT user1_id, user2_id FROM conversations WHERE id = ?',
                [data.conversation_id]
            );
            
            connection.release();
            
            // Determine recipient
            const recipient_id = participants[0].user1_id == data.user_id ? 
                participants[0].user2_id : participants[0].user1_id;
            
            // Send typing indicator to recipient
            if (userSockets[recipient_id]) {
                io.to(userSockets[recipient_id]).emit('user_typing', {
                    conversation_id: data.conversation_id,
                    is_typing: data.is_typing
                });
            }
            
        } catch (error) {
            console.error('Error with typing indicator:', error);
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        for (let user_id in userSockets) {
            if (userSockets[user_id] === socket.id) {
                delete userSockets[user_id];
                console.log(`User ${user_id} disconnected`);
                break;
            }
        }
    });
});

// Start the server
server.listen(3000, () => {
    console.log('WebSocket server running on https://satya.pl:3000');
});