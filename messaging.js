function compareDateTimes(firstDateTime, secondDateTime = null) {
    const [firstDateFormatted, firstTimeWithZ] = firstDateTime.split('T');
    const firstTimeFormatted = firstTimeWithZ ? firstTimeWithZ.replace('Z', '') : undefined;

    const result = {
        date: firstDateFormatted,
        time: firstTimeFormatted,
        matching_date: false
    };

    console.log(result);

    if (secondDateTime !== null) {
        const [secondDateFormatted] = secondDateTime.split('T');
        result.matching_date = firstDateFormatted === secondDateFormatted;
    }

    setCookie('lastMessageTime', firstDateTime, 1);
    return result;
}

function formatTime(timeString) {
    const [hours, minutes, seconds] = timeString.split(':').map(Number);
    const date = new Date();
    
    date.setHours(hours);
    date.setMinutes(minutes);
    date.setSeconds(seconds);
    
    return date.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('default', { month: 'short', day: '2-digit' });
}
function setCookie(name, value, days) {
    const d = new Date();
    d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000)); // Set expiration in 'days'
    const expires = "expires=" + d.toUTCString();
    document.cookie = name + "=" + value + ";" + expires + ";path=/";
}
function getCookie(name) {
    const cname = name + "=";
    const decodedCookie = decodeURIComponent(document.cookie);
    const cookieArr = decodedCookie.split(';');
    
    for (let i = 0; i < cookieArr.length; i++) {
        let c = cookieArr[i].trim();
        if (c.indexOf(cname) === 0) {
            return c.substring(cname.length, c.length);
        }
    }
    
    return null;
}
function removeCookie(name) {
    document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
}
function checkCookie(name) {
    const cookieValue = getCookie(name);
    
    if (cookieValue) {
        // console.log(`Cookie "${name}" is set with value: ${cookieValue}`);
        return true;
    } else {
        // console.log(`Cookie "${name}" is not set.`);
        return false;
    }
}
function decodeHtmlEntities(text) {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = text;
    return textarea.value;
}
function cleanMessage(m) {
    m = decodeHtmlEntities(m); // decode any encoded HTML
    let $msg = $("<div>").html(m); // Wrap in a jQuery object

    // Remove <br> tags that aren't followed by content
    $msg.find("br").each(function () {
        let $next = $(this).next();
        if ($next.length === 0 || ($next.is("br") || $next.text().trim() === "")) {
            $(this).remove();
        }
    });

    // Remove trailing empty tags
    $msg.children().each(function () {
        if ($(this).text().trim() === "" && $(this).find("img, iframe").length === 0) {
            $(this).remove();
        }
    });

    // Ensure the last <p> tag has margin-bottom: 0
    let $lastP = $msg.find("p").last();
    if ($lastP.length) {
        $lastP.css("margin-bottom", "0");
    }

    return $msg.html(); // Return cleaned HTML
}
function appendMessage(message) {
    // console.log(message);
    var sender_id = $('#sender_id').val();
    const messageClass = message.sender_id == sender_id ? 'sent' : 'received';
    
    let lastMessageTimeCookie = null;
    const cookieExists = checkCookie('lastMessageTime');
    if(cookieExists) {
        lastMessageTimeCookie = getCookie('lastMessageTime');
    }
    
    const dtObj = compareDateTimes(message.sent_at, lastMessageTimeCookie);

    // console.log(dtObj, lastMessageTimeCookie);


    const message_date = formatDate(dtObj.date);
    const message_time = formatTime(dtObj.time);

    let dateHtml = ``;
    let timeHtml = `<p>${message_time}</p>`;

    if(dtObj.matching_date == false) {
        dateHtml = `<div class="message-datetime">
            <span class="left"></span>
            <span class="message-date">${message_date}</span>
            <span class="right"></span>
        </div>`;
    }

    let m = cleanMessage(message.content);

    const messageHtml = `
        <div class="message ${messageClass}">
            <div class="top-row">
                <div class="message-meta">
                    ${dateHtml}
                </div>
            </div>
            <div class="bottom-row">
                
                <div class="message-col-left">
                    <div class="message-time">
                        ${timeHtml}
                    </div>
                    <div class="message-content">
                        ${m}
                    </div>
                </div>
            </div>
        </div>
    `;
    // <div style=\"background-image: url('serve_image.php?photo=${message.sender_photo}');\" class="avatar" data-user-id="${message.sender_id}"></div>
    // Append in conversation
    $('#messaging-tab-' + message.conversation_id + ' .message-list').append(messageHtml);
    
}
let typingTimer = null;

// Utility functions (keeping your existing utility functions)
// compareDateTimes, formatTime, formatDate, setCookie, getCookie, etc.



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

function scrollToLastMsg(conversationId) {
    const osViewport = $('#messaging-tab-' + conversationId + ' .os-viewport');
    osViewport.scrollTop(osViewport[0].scrollHeight);
}


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
    const currentConversationId = response.conversation_id;
    const username = response.username;
    const user_photo = response.user_photo;

    if (!$('#message-dropdown').hasClass('show-message-dropdown')) {
        $('#message-dropdown').addClass('show-message-dropdown');
        $('.unread-messages').css({ 'display': 'none' });
    }

    if (!$('.messaging-popup-wrapper').find('#messaging-tab-' + currentConversationId).length) {
        let newConversationTab = $(`
            <div class="messaging-popup" id="messaging-tab-${currentConversationId}">
                <div class="conversation-header">
                    <img class="avatar" src='${user_photo.startsWith("https://") ? user_photo : `serve_image.php?photo=${user_photo}`}'/>
                    <span class="conversation-username">${username}</span>
                    <span class="minimize" onclick='minimizeConversationTab("${currentConversationId}")'>
                        <i class="fa-regular fa-window-minimize"></i>
                    </span>
                    <span class="close" onclick='closeConversationTab("${currentConversationId}")'>
                        <i class="fa-regular fa-x"></i>
                    </span>
                </div>
                <div class="conversation-body">
                    <div class="notification-container">
                        <div class="notification-message"></div>
                    </div>
                    <div class="message-list-outer">
                        <div class="message-list" id="message-list">
                            <!-- auto msg populating area -->
                        </div>
                    </div>
                    <div class="message-input-area">
                        <div class="typing-indicator" style="display:none;"></div>
                        <div class="formatting-toolbar">
                            <button class="format-btn" data-format="bold"><i class="fas fa-bold"></i></button>
                            <button class="format-btn" data-format="italic"><i class="fas fa-italic"></i></button>
                            <button class="format-btn" data-format="underline"><i class="fas fa-underline"></i></button>
                            <button class="format-btn" data-format="strikethrough"><i class="fas fa-strikethrough"></i></button>
                            <button class="format-btn" data-format="link"><i class="fas fa-link"></i></button>
                            <button onclick='sendMessage("${currentConversationId}")' id="send-message-btn" class="send-message-btn custom-btn btn-16" data-send-conversation-id="${currentConversationId}">
                                <i class="fas fa-paper-plane"></i>
                            </button>
                        </div>
                        <div class="message-input message-input-${currentConversationId}" contenteditable="true" placeholder="Type a message..."></div>
                    </div>
                </div>
            </div>
        `);

        $('.messaging-popup-wrapper').append(newConversationTab);

        socket.emit('get_messages', {
            conversation_id: currentConversationId
        });
    }
}


function closeConversationTab(conversationId) {
    $('.messaging-popup-wrapper')
        .find('#messaging-tab-' + conversationId)
        .remove();
}
function minimizeConversationTab(conversationId) {
    if(
        !$('.messaging-popup-wrapper').find('#messaging-tab-' + conversationId).hasClass('minimized')
    ) {
        $('.messaging-popup-wrapper').find('#messaging-tab-' + conversationId).addClass('minimized');
    } else {
        $('.messaging-popup-wrapper').find('#messaging-tab-' + conversationId).removeClass('minimized');
    }
}
function appendMessage(message) {
    // console.log(message);
    var sender_id = $('#sender_id').val();
    const messageClass = message.sender_id == sender_id ? 'sent' : 'received';
    
    let lastMessageTimeCookie = null;
    const cookieExists = checkCookie('lastMessageTime');
    if(cookieExists) {
        lastMessageTimeCookie = getCookie('lastMessageTime');
    }
    
    const dtObj = compareDateTimes(message.sent_at, lastMessageTimeCookie);

    // console.log(dtObj, lastMessageTimeCookie);


    const message_date = formatDate(dtObj.date);
    const message_time = formatTime(dtObj.time);

    let dateHtml = ``;
    let timeHtml = `<p>${message_time}</p>`;

    if(dtObj.matching_date == false) {
        dateHtml = `<div class="message-datetime">
            <span class="left"></span>
            <span class="message-date">${message_date}</span>
            <span class="right"></span>
        </div>`;
    }

    let m = cleanMessage(message.content);

    const messageHtml = `
        <div class="message ${messageClass}">
            <div class="top-row">
                <div class="message-meta">
                    ${dateHtml}
                </div>
            </div>
            <div class="bottom-row">
                
                <div class="message-col-left">
                    <div class="message-time">
                        ${timeHtml}
                    </div>
                    <div class="message-content">
                        ${m}
                    </div>
                </div>
            </div>
        </div>
    `;
    // <div style=\"background-image: url('serve_image.php?photo=${message.sender_photo}');\" class="avatar" data-user-id="${message.sender_id}"></div>
    // Append in conversation
    $('#messaging-tab-' + message.conversation_id + ' .message-list').append(messageHtml);
    
}
function appendNewMessage(message) {
    // console.log(message);
    var sender_id = $('#sender_id').val();
    const messageClass = message.sender_id == sender_id ? 'sent' : 'received';
    
    let lastMessageTimeCookie = null;
    const cookieExists = checkCookie('lastMessageTime');
    if(cookieExists) {
        lastMessageTimeCookie = getCookie('lastMessageTime');
    }
    
    const dtObj = compareDateTimes(message.sent_at, lastMessageTimeCookie);

    // console.log(dtObj, lastMessageTimeCookie);


    const message_date = formatDate(dtObj.date);
    const message_time = formatTime(dtObj.time);

    let dateHtml = ``;
    let timeHtml = `<p>${message_time}</p>`;

    if(dtObj.matching_date == false) {
        dateHtml = `<div class="message-datetime">
            <span class="left"></span>
            <span class="message-date">${message_date}</span>
            <span class="right"></span>
        </div>`;
    }

    let m = cleanMessage(message.content);

    const messageHtml = `
        <div class="message ${messageClass}">
            <div class="top-row">
                <div class="message-meta">
                    ${dateHtml}
                </div>
            </div>
            <div class="bottom-row">
                
                <div class="message-col-left">
                    <div class="message-time">
                        ${timeHtml}
                    </div>
                    <div class="message-content">
                        ${m}
                    </div>
                </div>
            </div>
        </div>
    `;
    // <div style=\"background-image: url('serve_image.php?photo=${message.sender_photo}');\" class="avatar" data-user-id="${message.sender_id}"></div>
    // Append in conversation
    $('#messaging-tab-' + message.conversation_id + ' .os-content').append(messageHtml);
    scrollToLastMsg(message.conversation_id);
}

function showNotification(message, type) {
    const notificationMessage = $('#notification-message');

    // Set the message and type
    notificationMessage.text(message);
    notificationMessage.removeClass('success error').addClass(type);

    // Show the notification
    notificationMessage.addClass('show');

    // Hide the notification after 3 seconds
    setTimeout(() => {
        notificationMessage.removeClass('show');
    }, 3000);
}

