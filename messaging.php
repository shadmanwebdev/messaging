<script defer>
    const socket = io('wss://satya.pl:3000'); // Connect to WebSocket server
    
    // Current user ID from PHP
    const current_user_id = <?php echo $user_id; ?>;
    
    // Register user when page loads
    socket.emit('register_user', current_user_id);
    
    // Handle incoming messages
    socket.on('receive_message', function(messageData) {
        console.log('New message received:', messageData);
        appendNewMessage(messageData);
        scrollToLastMsg(messageData.conversation_id);
    });
    
    // Handle responses for conversation creation
    socket.on('conversation_created', function(response) {
        if (response.success) {
            // Create conversation tab with data from socket response
            createConversationTab(response);
        } else {
            showNotification('Failed to load conversation', 'error');
        }
    });
    
    // Handle responses for message loading
    socket.on('messages_loaded', function(response) {
        if (response.success) {
            loadMessagesFromData(response.messages, response.conversation_id);
        } else {
            showNotification('Failed to load messages', 'error');
        }
    });
    
    // Handle message sent confirmation
    socket.on('message_sent', function(response) {
        if (!response.success) {
            showNotification('Failed to send message', 'error');
        }
    });
    
    // Handle typing indicators
    socket.on('user_typing', function(data) {
        const typingIndicator = $(`#messaging-tab-${data.conversation_id} .typing-indicator`);
        if (data.is_typing) {
            typingIndicator.text('User is typing...').show();
        } else {
            typingIndicator.hide();
        }
    });
</script>