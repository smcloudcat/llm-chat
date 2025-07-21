document.addEventListener('DOMContentLoaded', () => {
    // 初始化语法高亮
    // hljs.highlightAll();

    // DOM元素
    const chatMessages = document.getElementById("chat-messages");
    const userInput = document.getElementById("user-input");
    const sendButton = document.getElementById("send-button");
    const typingIndicator = document.getElementById("typing-indicator");
    const sidebar = document.getElementById("sidebar");
    const historyBtn = document.getElementById("history-btn");
    const historyList = document.getElementById("history-list");
    const overlay = document.getElementById("overlay");
    const newChatBtn = document.querySelector(".new-chat-btn");

    // 聊天状态
    let chatHistory = [];
    let isProcessing = false;
    let currentChatId = null;
    let chats = {};

    /**
     * 初始化应用
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
                const lastChat = chatIds.sort((a, b) => chats[b].lastUpdated - chats[a].lastUpdated);
                loadChat(lastChat[0]);
            }
        }
        updateHistoryList();
        setupEventListeners();
    }

    /**
     * 设置事件监听器
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
     * 自动调整文本区域高度
     */
    function autoResizeTextarea() {
        this.style.height = "auto";
        this.style.height = (this.scrollHeight) + "px";
    }

    /**
     * 处理键盘事件（如Enter发送）
     */
    function handleKeydown(e) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    }

    /**
     * 发送消息到聊天API并处理响应
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
        updateHistoryList();

        try {
            const assistantMessageEl = addMessageToChat("assistant", "", false);
            scrollToBottom();

            // 修复URL路径
            const response = await fetch("/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages: chatHistory }),
            });

            if (!response.ok) throw new Error(`API错误: ${response.statusText}`);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let responseText = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n\n');
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.substring(6));
                            if (data.response) {
                                responseText += data.response;
                                renderMessageContent(assistantMessageEl, responseText, false);
                                scrollToBottom();
                            }
                        } catch (e) {
                            console.error('解析SSE事件错误:', e, line);
                        }
                    }
                }
            }
            
            renderMessageContent(assistantMessageEl, responseText, true);
            chatHistory.push({ role: "assistant", content: responseText });
            saveChat();
            updateHistoryList();

        } catch (error) {
            console.error("错误:", error);
            const errorEl = addMessageToChat("assistant", "", false);
            renderMessageContent(errorEl, "抱歉，发生错误，请重试。", true);
        } finally {
            setProcessingState(false);
            typingIndicator.classList.remove("visible");
        }
    }

    /**
     * 设置处理状态
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
     * 切换侧边栏可见性 - 修复类名
     */
    function toggleSidebar() {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active', sidebar.classList.contains('active'));
    }

    /**
     * 关闭侧边栏
     */
    function closeSidebar() {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
    }

    /**
     * 保存当前聊天到localStorage
     */
    function saveChat() {
        if (!currentChatId) return;
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
     * 从localStorage加载所有聊天
     */
    function loadChats() {
        chats = JSON.parse(localStorage.getItem('chats') || '{}');
    }

    /**
     * 加载特定聊天
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
     * 开始新聊天 - 修复初始化消息
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
        // 正确添加第一条消息
        const initialMessage = chatHistory[0];
        addMessageToChat(initialMessage.role, initialMessage.content, true);
        saveChat();
        updateHistoryList();
    }

    /**
     * 删除聊天记录
     */
    function deleteChat(chatId) {
        delete chats[chatId];
        localStorage.setItem('chats', JSON.stringify(chats));
        
        if (currentChatId === chatId) {
            const sortedChats = Object.values(chats).sort((a, b) => b.lastUpdated - a.lastUpdated);
            if (sortedChats.length > 0) {
                loadChat(sortedChats[0].id);
            } else {
                startNewChat();
            }
        }
        updateHistoryList();
    }

    /**
     * 更新侧边栏历史列表
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
                    ${chat.title || '新聊天'}
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
     * 添加消息到聊天显示
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
     * 渲染消息内容
     */
    function renderMessageContent(contentEl, content, final = false) {
        // 使用Markdown转换
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
     * 滚动到底部
     */
    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // 启动应用
    init();
});
