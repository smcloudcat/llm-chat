document.addEventListener('DOMContentLoaded', () => {
    // Initialize syntax highlighting for all code blocks that might exist statically
    // hljs.highlightAll();

    // DOM elements from the new template
    const chatMessages = document.getElementById("chat-messages");
    const userInput = document.getElementById("user-input");
    const sendButton = document.getElementById("send-button");
    const typingIndicator = document.getElementById("typing-indicator");
    const sidebar = document.getElementById("sidebar");
    const historyBtn = document.getElementById("history-btn"); // Replaces toggle-btn
    const historyList = document.getElementById("history-list");
    const overlay = document.getElementById("overlay");
    const newChatBtn = document.querySelector(".new-chat-btn");

    // Chat state
    let chatHistory = [];
    let isProcessing = false;
    let currentChatId = null;
    let chats = {};

    /**
     * Initializes the application
     */
    function init() {
        loadChats();
        const chatIds = Object.keys(chats);
        if (chatIds.length === 0) {
            startNewChat();
        } else {
            const lastChatId = localStorage.getItem('lastChatId');
            if (lastChatId && chats[lastChatId]) {
                loadChat(lastChatId);
            } else {
                // 修复：正确加载最新聊天记录
                const sortedChatIds = chatIds.sort((a, b) => chats[b].lastUpdated - chats[a].lastUpdated);
                if (sortedChatIds.length > 0) {
                    loadChat(sortedChatIds[0]); // 加载最新聊天
                } else {
                    startNewChat();
                }
            }
        }
        updateHistoryList();
        setupEventListeners();
    }

    /**
     * Sets up all event listeners
     */
    function setupEventListeners() {
        userInput.addEventListener("input", autoResizeTextarea);
        userInput.addEventListener("keydown", handleKeydown);
        sendButton.addEventListener("click", sendMessage);
        historyBtn.addEventListener("click", toggleSidebar);
        overlay.addEventListener("click", closeSidebar);
        newChatBtn.addEventListener("click", startNewChat);
        window.addEventListener("resize", () => {
             if (window.innerWidth > 768) {
                overlay.classList.remove('active');
            }
        });
    }

    /**
     * Auto-resizes the textarea as the user types
     */
    function autoResizeTextarea() {
        this.style.height = "auto";
        this.style.height = (this.scrollHeight) + "px";
    }

    /**
     * Handles keydown events on the textarea (e.g., Enter to send)
     * @param {KeyboardEvent} e - The keydown event
     */
    function handleKeydown(e) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    }

    /**
     * Sends a message to the chat API and processes the response
     */
    async function sendMessage() {
        const message = userInput.value.trim();
        if (message === "" || isProcessing) return;

        setProcessingState(true);
        addMessageToChat("user", message);
        userInput.value = "";
        userInput.style.height = "auto";
        typingIndicator.classList.add("visible");

        chatHistory.push({ role: "user", content: message });
        saveChat();
        updateHistoryList(); // Update title immediately

        try {
            const assistantMessageEl = addMessageToChat("assistant", "", false);
            scrollToBottom();

        // 获取选择的模型
        const modelSelect = document.getElementById("model-select");
        const selectedModel = modelSelect.value;

        const response = await fetch("/api/chat", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Accept": "text/event-stream"  // 明确接受SSE流
            },
            body: JSON.stringify({ 
                messages: chatHistory,
                model: selectedModel  // 添加模型参数
            }),
        });

            if (!response.ok) throw new Error(`API Error: ${response.statusText}`);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let responseText = "";
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                
                let endOfMessage;
                while ((endOfMessage = buffer.indexOf('\n\n')) >= 0) {
                    const eventString = buffer.slice(0, endOfMessage);
                    buffer = buffer.slice(endOfMessage + 2);
                    
                    if (eventString.startsWith('data: ')) {
                        try {
                            const jsonString = eventString.substring(6);
                            if (jsonString) {
                                const data = JSON.parse(jsonString);
                                if (data.response) {
                                    responseText += data.response;
                                    renderMessageContent(assistantMessageEl, responseText, false);
                                    scrollToBottom();
                                }
                            }
                        } catch (e) {
                            console.error('Error parsing SSE event:', e, eventString);
                        }
                    }
                }
            }
            
            renderMessageContent(assistantMessageEl, responseText, true);
            chatHistory.push({ role: "assistant", content: responseText });
            saveChat();
            updateHistoryList();

        } catch (error) {
            console.error("Error:", error);
            const errorEl = addMessageToChat("assistant", "", false);
            renderMessageContent(errorEl, "Sorry, an error occurred. Please try again.", true);
        } finally {
            setProcessingState(false);
            typingIndicator.classList.remove("visible");
        }
    }

    /**
     * Toggles the processing state of the UI
     * @param {boolean} processing - Whether the app is processing a message
     */
    function setProcessingState(processing) {
        isProcessing = processing;
        userInput.disabled = processing;
        sendButton.disabled = processing;
        if (processing) {
            sendButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        } else {
            sendButton.innerHTML = '<i class="fas fa-paper-plane"></i> 发送';
        }
        if (!processing) userInput.focus();
    }

    /**
     * Toggles the sidebar visibility
     */
    function toggleSidebar() {
        const isCollapsed = sidebar.classList.toggle('collapsed');
        overlay.classList.toggle('active', !isCollapsed);
    }

    /**
     * Closes the sidebar
     */
    function closeSidebar() {
        sidebar.classList.add('collapsed');
        overlay.classList.remove('active');
    }

    /**
     * Saves the current chat to localStorage
     */
    function saveChat() {
        if (!currentChatId) return;
        // Generate title from the first user message, or use a default.
        const userMessage = chatHistory.find(m => m.role === 'user');
        const chatTitle = userMessage ? userMessage.content.substring(0, 40) : "新对话";

        chats[currentChatId] = {
            id: currentChatId,
            title: chatTitle,
            history: [...chatHistory],
            lastUpdated: Date.now()
        };
        localStorage.setItem('chats', JSON.stringify(chats));
        localStorage.setItem('lastChatId', currentChatId);
    }

    /**
     * Loads all chats from localStorage
     */
    function loadChats() {
        chats = JSON.parse(localStorage.getItem('chats') || '{}');
    }

    /**
     * Loads a specific chat into the main view
     * @param {string} chatId - The ID of the chat to load
     */
    function loadChat(chatId) {
        if (!chats[chatId]) return;
        
        closeSidebar();
        currentChatId = chatId;
        chatHistory = [...chats[chatId].history];
        
        chatMessages.innerHTML = '';
        chatHistory.forEach(msg => {
            addMessageToChat(msg.role, msg.content, true);
        });
        localStorage.setItem('lastChatId', currentChatId);
        updateHistoryList();
        scrollToBottom();
    }

    /**
     * Starts a new chat session
     */
    function startNewChat() {
        closeSidebar();
        currentChatId = Date.now().toString();
        chatHistory = [
            {
                role: "assistant",
                content: "您好！我是您的AI助手。请问有什么可以帮您的吗？",
            },
        ];
        chatMessages.innerHTML = '';
        // 修复：正确引用第一条消息
        const initialMessage = chatHistory[0];
        addMessageToChat(initialMessage.role, initialMessage.content, true);
        saveChat();
        updateHistoryList();
    }

    /**
     * Deletes a chat from history
     * @param {string} chatId - The ID of the chat to delete
     */
    function deleteChat(chatId) {
        delete chats[chatId];
        localStorage.setItem('chats', JSON.stringify(chats));
        
            if (currentChatId === chatId) {
                const sortedChats = Object.values(chats).sort((a, b) => b.lastUpdated - a.lastUpdated);
                if (sortedChats.length > 0) {
                    loadChat(sortedChats[0].id); // 修复：加载最新聊天ID
                } else {
                    startNewChat();
                }
            }
        updateHistoryList();
    }

    /**
     * Updates the history list in the sidebar
     */
    function updateHistoryList() {
        historyList.innerHTML = '';
        const sortedChats = Object.values(chats).sort((a, b) => b.lastUpdated - a.lastUpdated);

        sortedChats.forEach(chat => {
            const item = document.createElement('div');
            item.className = `history-item ${chat.id === currentChatId ? 'active' : ''}`;
            item.onclick = () => loadChat(chat.id);

            item.innerHTML = `
                <div>
                    <i class="fas fa-comment icon"></i>
                    ${chat.title || 'New Chat'}
                </div>
                <button class="delete-btn">
                    <i class="fas fa-trash"></i>
                </button>
            `;

            item.querySelector('.delete-btn').onclick = (e) => {
                e.stopPropagation();
                if (confirm(`您确定要删除对话 "${chat.title}" 吗?`)) {
                    deleteChat(chat.id);
                }
            };
            historyList.appendChild(item);
        });
    }

    /**
     * Adds a message to the chat display
     * @param {string} role - 'user' or 'assistant'
     * @param {string} content - The message content
     * @param {boolean} isFinal - True if the content is complete
     * @returns {HTMLElement} - The created message element
     */
    function addMessageToChat(role, content, isFinal = true) {
        const messageContainer = document.createElement('div');
        messageContainer.classList.add('message', `${role}-message`);

        const avatarDiv = document.createElement('div');
        avatarDiv.classList.add('avatar');
        avatarDiv.innerHTML = `<i class="fas ${role === 'user' ? 'fa-user' : 'fa-robot'}"></i>`;

        const contentDiv = document.createElement('div');
        contentDiv.classList.add('message-content');

        if (role === 'user') {
            messageContainer.appendChild(contentDiv);
            messageContainer.appendChild(avatarDiv);
        } else {
            messageContainer.appendChild(avatarDiv);
            messageContainer.appendChild(contentDiv);
        }
        
        renderMessageContent(contentDiv, content, isFinal);
        chatMessages.appendChild(messageContainer);
        
        if (isFinal) {
            scrollToBottom();
        }
        return contentDiv;
    }

    /**
     * Renders the content of a message, handling markdown and code highlighting
     * @param {HTMLElement} contentEl - The element to render content into
     * @param {string} content - The raw message content
     * @param {boolean} final - Whether this is the final render for the message
     */
    function renderMessageContent(contentEl, content, final = false) {
        // Use a library for robust Markdown conversion
        const rawHtml = marked.parse(content, {
            highlight: function(code, lang) {
                const language = hljs.getLanguage(lang) ? lang : 'plaintext';
                return hljs.highlight(code, { language }).value;
            },
            gfm: true,
            breaks: true,
        });

        contentEl.innerHTML = rawHtml;

        if (final) {
            contentEl.querySelectorAll('pre').forEach(pre => {
                const codeBlock = pre.querySelector('code');
                const lang = [...codeBlock.classList].find(c => c.startsWith('language-'))?.replace('language-', '') || 'code';

                const header = document.createElement('div');
                header.className = 'pre-header';
                
                const langSpan = document.createElement('span');
                langSpan.className = 'lang';
                langSpan.textContent = lang;

                const copyBtn = document.createElement('button');
                copyBtn.className = 'copy-btn';
                copyBtn.innerHTML = '<i class="fas fa-copy"></i> 复制代码';
                
                copyBtn.addEventListener('click', () => {
                    navigator.clipboard.writeText(codeBlock.innerText).then(() => {
                        copyBtn.innerHTML = '<i class="fas fa-check"></i> 已复制';
                        setTimeout(() => {
                            copyBtn.innerHTML = '<i class="fas fa-copy"></i> 复制代码';
                        }, 2000);
                    });
                });

                header.appendChild(langSpan);
                header.appendChild(copyBtn);
                pre.insertBefore(header, codeBlock);
            });
        }
    }

    /**
     * Scrolls the chat messages to the bottom
     */
    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Start the application
    init();
});
