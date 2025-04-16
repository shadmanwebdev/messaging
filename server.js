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
    user: 'duszyczkowo',
    password: 'i_still_walk_in_light',
    database: 'satya'
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
            
            // Check if a conversation exists between these users
            const [existingConversations] = await connection.execute(`
                SELECT c.conversation_id 
                FROM Conversations c
                JOIN ConversationParticipants cp1 ON c.conversation_id = cp1.conversation_id
                JOIN ConversationParticipants cp2 ON c.conversation_id = cp2.conversation_id
                WHERE cp1.user_id = ? AND cp2.user_id = ?
                AND (SELECT COUNT(*) FROM ConversationParticipants WHERE conversation_id = c.conversation_id) = 2
            `, [data.current_user_id, data.recipient_id]);
            
            let conversation_id;
            
            if (existingConversations.length === 0) {
                // Create new conversation
                const [result] = await connection.execute(
                    'INSERT INTO Conversations (created_at) VALUES (NOW())'
                );
                conversation_id = result.insertId;
                
                // Add participants
                await connection.execute(
                    'INSERT INTO ConversationParticipants (conversation_id, user_id) VALUES (?, ?)',
                    [conversation_id, data.current_user_id]
                );
                await connection.execute(
                    'INSERT INTO ConversationParticipants (conversation_id, user_id) VALUES (?, ?)',
                    [conversation_id, data.recipient_id]
                );
            } else {
                conversation_id = existingConversations[0].conversation_id;
            }
            
            // Get recipient info
            const [userInfo] = await connection.execute(
                'SELECT username, photo FROM users WHERE user_id = ?',
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
            const [messages] = await connection.execute(`
                SELECT m.message_id as id, m.conversation_id, m.sender_id, 
                       u.username as sender_name, u.photo as sender_photo, 
                       m.content, m.sent_at
                FROM Messages m
                JOIN users u ON m.sender_id = u.user_id
                WHERE m.conversation_id = ?
                ORDER BY m.sent_at ASC
            `, [data.conversation_id]);
            
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
                'INSERT INTO Messages (conversation_id, sender_id, content, sent_at) VALUES (?, ?, ?, NOW())',
                [messageData.conversation_id, messageData.sender_id, messageData.content]
            );
            
            // Get current timestamp for sent_at
            const [timeResult] = await connection.execute('SELECT NOW() as sent_at');
            const sent_at = timeResult[0].sent_at;
            
            // Update conversation's updated_at timestamp
            await connection.execute(
                'UPDATE Conversations SET updated_at = NOW() WHERE conversation_id = ?',
                [messageData.conversation_id]
            );
            
            // Get sender info
            const [senderInfo] = await connection.execute(
                'SELECT username, photo FROM users WHERE user_id = ?',
                [messageData.sender_id]
            );
            
            // Get participants in this conversation
            const [participants] = await connection.execute(
                'SELECT user_id FROM ConversationParticipants WHERE conversation_id = ?',
                [messageData.conversation_id]
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
            
            // Notify all participants except sender
            participants.forEach(participant => {
                if (participant.user_id != messageData.sender_id && userSockets[participant.user_id]) {
                    io.to(userSockets[participant.user_id]).emit('receive_message', completeMessage);
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
    
    
    const getUnreadCount = async (user_id) => {
        const connection = await pool.getConnection();
    
        const [result] = await connection.execute(
            `SELECT COUNT(*) as unreadCount 
             FROM Messages m
             JOIN ConversationParticipants cp ON m.conversation_id = cp.conversation_id
             WHERE cp.user_id = ? AND m.sender_id != ? AND m.is_read = 0`,
            [user_id, user_id]
        );
        connection.release();
        return result[0].unreadCount;
    };

    socket.on('getUnreadCount', async () => {
        try {
            const unreadCount = await getUnreadCount();
            console.log('unreadCount', { unreadCount });
            socket.emit('unreadCount', { unreadCount });
        } catch (err) {
            console.error(err);
        }
    });
    
    socket.on('getUnreadConversations', async (user_id) => {
        try {
            const connection = await pool.getConnection();
            const [conversations] = await connection.execute(`
                SELECT 
    c.conversation_id,
    COUNT(*) AS unread_count,

    -- Last message info, excluding logged-in user
    (
        SELECT m2.sender_id
        FROM Messages m2
        WHERE m2.conversation_id = c.conversation_id AND m2.sender_id != ?
        ORDER BY m2.sent_at DESC
        LIMIT 1
    ) AS last_sender_id,

    (
        SELECT m2.content
        FROM Messages m2
        WHERE m2.conversation_id = c.conversation_id AND m2.sender_id != ?
        ORDER BY m2.sent_at DESC
        LIMIT 1
    ) AS last_message,

    -- Get last sender's username
    (
        SELECT u2.username
        FROM Messages m3
        JOIN users u2 ON u2.user_id = m3.sender_id
        WHERE m3.conversation_id = c.conversation_id AND m3.sender_id != ?
        ORDER BY m3.sent_at DESC
        LIMIT 1
    ) AS last_sender_username,

    -- Get last sender's photo
    (
        SELECT u2.photo
        FROM Messages m3
        JOIN users u2 ON u2.user_id = m3.sender_id
        WHERE m3.conversation_id = c.conversation_id AND m3.sender_id != ?
        ORDER BY m3.sent_at DESC
        LIMIT 1
    ) AS last_sender_photo

FROM Conversations c
JOIN ConversationParticipants cp ON cp.conversation_id = c.conversation_id
JOIN Messages m ON m.conversation_id = c.conversation_id

WHERE cp.user_id = ? AND m.sender_id != ? AND m.is_read = 0

GROUP BY c.conversation_id
ORDER BY c.updated_at DESC

            `, [user_id, user_id, user_id, user_id, user_id, user_id]);
            connection.release();
            socket.emit('unreadConversations', { conversations });
        } catch (err) {
            console.error(err);
        }
    });

    socket.on('getConversationParticipants', async ({ conversation_id }) => {
        try {
            const connection = await pool.getConnection();
            const [rows] = await connection.execute(
                'SELECT user_id FROM ConversationParticipants WHERE conversation_id = ?',
                [conversation_id]
            );
            const participants = rows.map(row => row.user_id);
            connection.release();
            socket.emit('conversationParticipants', { success: true, participants });
        } catch (err) {
            socket.emit('conversationParticipants', { success: false });
        }
    });
    
    // Typing indicator
    socket.on('typing', async (data) => {
        try {
            const connection = await pool.getConnection();
            
            // Get the other participants in the conversation
            const [participants] = await connection.execute(
                'SELECT user_id FROM ConversationParticipants WHERE conversation_id = ? AND user_id != ?',
                [data.conversation_id, data.user_id]
            );
            
            connection.release();
            
            // Send typing indicator to all other participants
            participants.forEach(participant => {
                if (userSockets[participant.user_id]) {
                    io.to(userSockets[participant.user_id]).emit('user_typing', {
                        conversation_id: data.conversation_id,
                        user_id: data.user_id,
                        is_typing: data.is_typing
                    });
                }
            });
            
        } catch (error) {
            console.error('Error with typing indicator:', error);
        }
    });

    // Mark messages as read
    socket.on('mark_messages_read', async (data) => {
        try {
            const connection = await pool.getConnection();
            
            // Update messages where the current user is not the sender
            await connection.execute(
                'UPDATE Messages SET is_read = 1 WHERE conversation_id = ? AND sender_id != ?',
                [data.conversation_id, data.user_id]
            );
            
            connection.release();
            
            socket.emit('messages_marked_read', {
                success: true,
                conversation_id: data.conversation_id
            });
            
        } catch (error) {
            console.error('Database error:', error);
            socket.emit('messages_marked_read', {
                success: false,
                error: 'Failed to mark messages as read'
            });
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
server.listen(3000, '0.0.0.0', () => {
    console.log('WebSocket server listening on port 3000');
});