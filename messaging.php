<?php 
    $user_id = get_uid();
    $_SESSION['user_id'] = $user_id; // send-message-btn newPopupcustom-btn btn-16 the ajax endpoints expect it and it may be the safest way to do it. I'd love to validate with a hash, but this may need to come later.

?>
<script>
    document.cookie = "lastMessageTime" + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
</script>

<html>
<head>
    <script src="https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.min.js"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.3/css/all.min.css">
    <link rel="stylesheet" href="messaging.css?v=70">
</head>
<body>
    
    <input type="hidden" id='sender_id' value="<?= $user_id; ?>">
    
    <script src="https://cdn.socket.io/4.4.0/socket.io.min.js"></script>


    <!-- Scroll -->
    <script defer>
    </script>


    <script defer>    
        $(document).ready(function() {
            const $messageIcon = $('#message-notification');
            const $unreadIndicator = $('#unread-indicator');
            const $messageTooltip = $('#message-tooltip');
            const $unreadConversations = $('#unread-conversations');
            const $messageInput = $('#message-input');
            const $sendButton = $('#send-message-btn');
            const $formattingButtons = $('.format-btn');

            const messageTrigger = $('.message-btn');
            const messageDropdown = $('.message-dropdown');  

            $formattingButtons.click(function() {
                const format = $(this).data('format');
                document.execCommand(format, false, null);
                $messageInput.focus();
            });

            $messageIcon.hover(
                function() {
                    $messageTooltip.removeClass('hidden');
                },
                function() {
                    $messageTooltip.addClass('hidden');
                }
            );
            
            $('body').click(function(e) {
                e.stopPropagation();

                const messageTrigger = $('.message-btn')[0]; // Get the DOM element
                const messageDropdown = $('.message-dropdown')[0]; // Get the DOM element

                if (messageTrigger && messageDropdown) { 
                    if (!messageTrigger.contains(e.target) && !messageDropdown.contains(e.target)) {
                        // $('.message-dropdown')[0].addClass('hidden');
                    }
                }
            });
        });
    </script>
    
    <script>
        const socket = io('wss://satya.pl:3000'); // Connect to WebSocket server
        
        // Current user ID from PHP
        const current_user_id = <?php echo $user_id; ?>;
        
    </script>
        
    <script src="messaging.js?v=80" defer></script>
    
    <script defer>
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
            console.log(response);
            if (response.success) {
                appendNewMessage(response.message);
            } else {
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
        
        
        function updateNotifications() {
            socket.emit('getUnreadCount', current_user_id);
        }
        
        socket.on('unreadCount', (response) => {
            console.log("Unread count", response);
            const unreadCount = response.unreadCount;
            if (unreadCount > 0) {
                $('#unread-indicator').removeClass('hidden');
                $('#message-tooltip').text(`You have ${unreadCount} unread message(s)`);
            } else {
                $('#unread-indicator').addClass('hidden');
                $('#message-tooltip').text('No unread messages');
            }
        });
        
        
        function loadUnreadConversations() {
            socket.emit('getUnreadConversations', current_user_id);
            console.log("getUnreadConversations event emitted");
        }
        
        socket.on('unreadConversations', (response) => {
            console.log("unread conversations loaded", response);
            $('#unread-conversations').empty();
            response.conversations.forEach(function(conversation) {
                let lastMessage = conversation.last_message || "No messages yet";

                // Convert string to actual HTML
                let tempDiv = document.createElement("div");
                tempDiv.innerHTML = lastMessage;
                lastMessage = tempDiv.innerHTML;

                lastMessage = truncateHTML(lastMessage, 30);

                $('#unread-conversations').append(`
                    <div onclick='openMessagingPopup("${conversation.last_sender_id}", "${conversation.last_sender_username}", "${conversation.last_sender_photo}");' data-user-photo='${conversation.last_sender_photo}' class="unread-message conversation-item conversation-listener" data-user-id="${conversation.last_sender_id}">
                        <div class='msg-col-1'>
                            <div class='msg-photo'>
                                <img src='${conversation.last_sender_photo.startsWith("https://") ? conversation.last_sender_photo : `serve_image.php?photo=${conversation.last_sender_photo}`}'/>
                            </div>
                        </div>
                        <div class='msg-col-right'>
                            <div class="msg-content">
                                <div class="conversation-username">${conversation.last_sender_username}</div> 
                                <div class="last-message">${$("<div>").html(lastMessage).text()}</div>
                            </div>
                            <span class="unread-count">${conversation.unread_count}</span>
                        </div>
                    </div>
                `);
            });

            const unreadDropdown = document.querySelector('.unread-inner-div');
            const osInstance2 = OverlayScrollbars(unreadDropdown);
            if (osInstance2) {
                osInstance2.update();
            } else {
                OverlayScrollbars(unreadDropdown, {
                    scrollbars: {
                        autoHide: "leave",
                        theme: "os-theme-light"
                    }
                });
            }
        });
        
        
        function getOtherParticipantId(conversationId) {
            return new Promise((resolve, reject) => {
                socket.emit('getConversationParticipants', { conversation_id: conversationId });

                socket.once('conversationParticipants', (response) => {
                    if (response.success) {
                        const currentUserId = <?php echo $user_id; ?>;
                        const otherId = response.participants.find(p => p !== currentUserId);
                        resolve(otherId);
                    } else {
                        reject('Failed to get participants');
                    }
                });
            });
        }
        
    </script>
    
    
    <script defer>
        
        let currentConversationId;

        $('.message-btn').click(function(e) {
            e.stopPropagation();
        
            const messageTrigger = $('.message-btn');
            const messageDropdown = $('.message-dropdown'); 
         
            if (messageDropdown && messageDropdown !== null) {
                if ($(messageDropdown).hasClass('show-message-dropdown')) {
                    $('.profile-dropdown').removeClass('show-profile-dropdown');
                    $('.profile-btn').removeClass('show-profile-dropdown');
                    $('.notification-btn').removeClass('show-notification-dropdown');
                    $('.notification-dropdown').removeClass('show-notification-dropdown');
                    $('.message-btn').removeClass('show-message-dropdown');
                    $('.message-dropdown').removeClass('show-message-dropdown');
                } else {
                    $('.profile-dropdown').removeClass('show-profile-dropdown');
                    $('.profile-btn').removeClass('show-profile-dropdown');
                    $('.notification-btn').removeClass('show-notification-dropdown');
                    $('.notification-dropdown').removeClass('show-notification-dropdown');
                    $('.message-btn').addClass('show-message-dropdown');
                    $('.message-dropdown').addClass('show-message-dropdown');
                    $('.unread-messages').css({ 'display': 'flex' });
                }
            }
            loadUnreadConversations();
        });
        $(document).ready(function() {
            
            function truncateHTML(html, maxLength) {
                let tempDiv = document.createElement("div");
                // Decode HTML entities (e.g., &lt;br&gt; -> <br>)
                let textArea = document.createElement("textarea");
                textArea.innerHTML = html;
                let decodedHtml = textArea.value;

                tempDiv.innerHTML = decodedHtml;

                // Function to safely extract the visible text and respect HTML tags
                let visibleText = tempDiv.textContent || tempDiv.innerText;

                // If the visible text is already smaller than maxLength, no need to truncate
                if (visibleText.length <= maxLength) {
                    return decodedHtml;
                }

                let truncatedText = '';
                let totalLength = 0;
                let nodes = tempDiv.childNodes;

                // Traverse through all child nodes
                for (let node of nodes) {
                    if (totalLength >= maxLength) break;

                    // If the node is a text node, count its length
                    if (node.nodeType === Node.TEXT_NODE) {
                        let text = node.textContent;
                        let remaining = maxLength - totalLength;

                        if (text.length > remaining) {
                            truncatedText += text.substring(0, remaining);
                            totalLength = maxLength;
                        } else {
                            truncatedText += text;
                            totalLength += text.length;
                        }
                    } else if (node.nodeType === Node.ELEMENT_NODE) {
                        // For elements, add the tag, but check if we will exceed the maxLength
                        let elementHtml = node.outerHTML;

                        let remaining = maxLength - totalLength;
                        if (elementHtml.length > remaining) {
                            truncatedText += elementHtml.substring(0, remaining);
                            totalLength = maxLength;
                            break;
                        } else {
                            truncatedText += elementHtml;
                            totalLength += elementHtml.length;
                        }

                        // Check if we encounter a <br> tag and stop truncating at 40 characters
                        if (node.nodeName.toLowerCase() === 'br') {
                            truncatedText += node.outerHTML;
                            totalLength = maxLength;
                            break;
                        }
                    }
                }

                // If we exceed the maxLength, add ellipsis
                if (totalLength > maxLength) {
                    truncatedText = truncatedText.substring(0, maxLength) + "...";
                }

                // Remove <br> tags after truncation
                truncatedText = truncatedText.replace(/<br\s*\/?>/gi, "");
                
                return truncatedText;
            }

            // Update notifications every 30 seconds
            updateNotifications();
            setInterval(updateNotifications, 30000);

            $('.message-input').keypress(function(e) {
                if (e.which === 13 && !e.shiftKey) {
                    e.preventDefault();

                    // Find the closest messaging popup
                    const $popup = $(this).closest('.messaging-popup');

                    // Get the conversation ID from the nearest send button
                    const conversationId = $popup.find('.send-message-btn').data('send-conversation-id');

                    sendMessage(conversationId);
                }
            });
        

            function handleTyping() {
                console.log("User is typing...");

                const conversationId = currentConversationId;

                if (!conversationId) {
                    console.error('No conversation ID found.');
                    return;
                }
                
                getOtherParticipantId(conversationId)
                    .then(recipientId => {
                        socket.emit('typing', {
                            conversation_id: conversationId,
                            sender_id: <?php echo $user_id; ?>,
                            sender_name: 'You', 
                            recipient_id: recipientId,
                        });
                    })
                    .catch(error => {
                        console.error('Error getting other participant:', error);
                    });
            }

            // Handle the input event (fires when content changes)
            $('#message-input').on('input', function() {
                handleTyping();
            });


            // Show typing indicator when the other user is typing
            socket.on('typing', function(data) {
                if (data.recipient_id === <?php echo $user_id; ?>) {
                    showTypingIndicator(data.sender_name); // Show the typing indicator for the other user
                }
            });

            // Function to show typing indicator
            function showTypingIndicator(sender_name) {
                $('#typing-indicator').text(sender_name + ' is typing...').show();
            }



        });

        

    </script>
    
    
</body>
</html>
