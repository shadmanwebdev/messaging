// Variables
let currentConversationId = null;
let typingTimer = null;

// Utility functions (keeping your existing utility functions)
// compareDateTimes, formatTime, formatDate, setCookie, getCookie, etc.

// Open messaging popup - now using WebSockets
function openMessagingPopup(userId, username, user_photo) {
    // Request conversation via WebSocket
    socket.emit('get_conversation', {
        current_user_id: $('#sender_id').val(),
        recipient_id: userId
    });
}

// Create conversation tab 
function createConversationTab(response) {
    currentConversationId = response.conversation_id;
    
    if (!$('#message-dropdown').hasClass('show-message-dropdown')) {
        $('#message-dropdown').addClass('show-message-dropdown');
        $('.unread-messages').css({ 'display': 'none' });
    }
    
    // Check if conversation tab already exists
    if(!$('.messaging-popup-wrapper').find('#messaging-tab-' + currentConversationId).length > 0) {
        // New conversation tab (your existing HTML template)
        let newConversationTab = $(`
            <div class="messaging-popup" id="messaging-tab-${currentConversationId}">
                <!-- Your existing HTML structure -->
            </div>
        `);
        
        $('.messaging-popup-wrapper').append(newConversationTab);
        
        // Request messages via WebSocket
        socket.emit('get_messages', {
            conversation_id: currentConversationId
        });
    }
}

// Load messages from socket data
function loadMessagesFromData(messages, conversationId) {
    $('#messaging-tab-' + conversationId + ' .message-list').empty();
    
    messages.forEach(function(message) {
        appendMessage(message);
    });
    
    const messagesList = document.querySelector('#messaging-tab-' + conversationId + ' .message-list');
    const osInstance2 = OverlayScrollbars(messagesList);
    if (osInstance2) {
        osInstance2.update();
    } else {
        OverlayScrollbars(messagesList, {
            scrollbars: {
                autoHide: "leave",
                theme: "os-theme-light"
            }
        });
    }
    
    scrollToLastMsg(conversationId);
}

// Send message - now using WebSockets
function sendMessage(conversationId) {
    const $messageInput = $('.message-input-'+conversationId);
    const content = $messageInput.html();
    
    if (content.trim() === '') return;
    
    // Send message via WebSocket
    socket.emit('send_message', {
        conversation_id: conversationId,
        sender_id: $('#sender_id').val(),
        content: content
    });
    
    // Clear input field immediately for better UX
    $messageInput.html('');
}

// Handle typing indicators
$(document).on('input', '.message-input', function() {
    const conversationId = $(this).closest('.messaging-popup').attr('id').replace('messaging-tab-', '');
    
    // Clear previous timer
    clearTimeout(typingTimer);
    
    // Emit typing started
    socket.emit('typing', {
        conversation_id: conversationId,
        user_id: $('#sender_id').val(),
        is_typing: true
    });
    
    // Set timer to stop typing indicator after delay
    typingTimer = setTimeout(function() {
        socket.emit('typing', {
            conversation_id: conversationId,
            user_id: $('#sender_id').val(),
            is_typing: false
        });
    }, 2000);
});

// Keep the rest of your functions - appendMessage, appendNewMessage, etc.
function closeConversationTab(conversationId) {
    $('.messaging-popup-wrapper')
        .find('#messaging-tab-' + conversationId)
        .remove();
}

function minimizeConversationTab(conversationId) {
    if(!$('.messaging-popup-wrapper').find('#messaging-tab-' + conversationId).hasClass('minimized')) {
        $('.messaging-popup-wrapper').find('#messaging-tab-' + conversationId).addClass('minimized');
    } else {
        $('.messaging-popup-wrapper').find('#messaging-tab-' + conversationId).removeClass('minimized');
    }
}
