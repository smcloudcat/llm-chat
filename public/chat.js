/**
 * LLM Chat App Frontend
 *
 * Handles the chat UI interactions and communication with the backend API.
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM elements
  const chatMessages = document.getElementById("chat-messages");
  const userInput = document.getElementById("user-input");
  const sendButton = document.getElementById("send-button");
  const typingIndicator = document.getElementById("typing-indicator");
  const sidebar = document.getElementById("sidebar");
  const toggleBtn = document.getElementById("toggle-btn");
  const historyList = document.getElementById("history-list");
  const overlay = document.getElementById("overlay");
  const chatContainer = document.querySelector('.chat-container');

  // Chat state
  let chatHistory = [
    {
      role: "assistant",
      content:
        "Hello! I'm an LLM chat app powered by Cloudflare Workers AI. How can I help you today?",
    },
  ];
  let isProcessing = false;
  let currentChatId = null;
  let chats = {};

  /**
   * Initializes the application
   */
  function init() {
    loadChats();
    if (Object.keys(chats).length === 0) {
      startNewChat();
    } else {
      const lastChatId = localStorage.getItem('lastChatId') || Object.keys(chats)[0];
      loadChat(lastChatId);
    }
    updateHistoryList();
    setupEventListeners();
    adjustUIForScreenSize();
  }

  /**
   * Sets up all event listeners
   */
  function setupEventListeners() {
    userInput.addEventListener("input", autoResizeTextarea);
    userInput.addEventListener("keydown", handleKeydown);
    sendButton.addEventListener("click", sendMessage);
    toggleBtn.addEventListener("click", toggleSidebar);
    overlay.addEventListener("click", closeSidebar);
    window.addEventListener("resize", adjustUIForScreenSize);
  }

  /**
   * Auto-resizes the textarea as the user types
   */
  function autoResizeTextarea() {
    this.style.height = "auto";
    this.style.height = this.scrollHeight + "px";
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

    try {
      const assistantMessageEl = createMessageElement("assistant");
      chatMessages.appendChild(assistantMessageEl);
      scrollToBottom();

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: chatHistory }),
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
        
        // 尝试按换行符分割JSON对象
        const lines = buffer.split('\n');
        buffer = lines.pop() || ""; // 保存未完成的行

        for (const line of lines) {
          if (line.trim() === '') continue;
          
          try {
            const data = JSON.parse(line);
            if (data.response) {
              responseText += data.response;
              renderMessageContent(assistantMessageEl, responseText);
              scrollToBottom();
            }
          } catch (e) {
            console.error('Error parsing JSON chunk:', e, line);
          }
        }
      }
      
      // 处理剩余的buffer内容
      if (buffer.trim() !== '') {
        try {
          const data = JSON.parse(buffer);
          if (data.response) {
            responseText += data.response;
            renderMessageContent(assistantMessageEl, responseText);
          }
        } catch (e) {
          console.error('Error parsing final JSON chunk:', e, buffer);
        }
      }
      
      renderMessageContent(assistantMessageEl, responseText, true);
      chatHistory.push({ role: "assistant", content: responseText });
      saveChat();
      updateHistoryList();

    } catch (error) {
      console.error("Error:", error);
      addMessageToChat("assistant", "Sorry, an error occurred. Please try again.");
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
    if (!processing) userInput.focus();
  }

  /**
   * Toggles the sidebar visibility
   */
  function toggleSidebar() {
    sidebar.classList.toggle('collapsed');
    const isCollapsed = sidebar.classList.contains('collapsed');

    if (window.innerWidth <= 768) {
      overlay.classList.toggle('active', !isCollapsed);
    }
    
    // The chat container margin is now handled by CSS, so no JS update is needed here.
    // We just need to ensure the class is toggled.
  }

  /**
   * Closes the sidebar (for mobile/overlay click)
   */
  function closeSidebar() {
    sidebar.classList.add('collapsed');
    overlay.classList.remove('active');
  }

  /**
   * Adjusts UI elements based on screen size
   */
  function adjustUIForScreenSize() {
    // Most of this is now handled by CSS media queries.
    // We just need to ensure the overlay is not stuck active on resize.
    if (window.innerWidth > 768) {
      overlay.classList.remove('active');
      // Optional: decide if you want the sidebar to auto-open on larger screens
      // sidebar.classList.remove('collapsed'); 
    } else {
       // On smaller screens, we want the sidebar to be collapsed by default.
       if (!sidebar.classList.contains('collapsed')) {
           sidebar.classList.add('collapsed');
       }
    }
  }

  /**
   * Saves the current chat to localStorage
   */
  function saveChat() {
    if (!currentChatId) return;
    const chatTitle = chatHistory.length > 1 ? chatHistory[1].content.substring(0, 40) : "New Chat";
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
        content: "Hello! How can I assist you today?",
      },
    ];
    chatMessages.innerHTML = '';
    addMessageToChat(chatHistory[0].role, chatHistory[0].content);
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
      const remainingChats = Object.keys(chats);
      if (remainingChats.length > 0) {
        loadChat(remainingChats[0]);
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
    
    const newChatBtn = document.createElement('div');
    newChatBtn.className = 'history-item new-chat-btn';
    newChatBtn.innerHTML = '<span>+ New Chat</span>';
    newChatBtn.onclick = startNewChat;
    historyList.appendChild(newChatBtn);

    const sortedChats = Object.values(chats).sort((a, b) => b.lastUpdated - a.lastUpdated);

    sortedChats.forEach(chat => {
      const item = document.createElement('div');
      item.className = `history-item ${chat.id === currentChatId ? 'active' : ''}`;
      item.onclick = () => loadChat(chat.id);

      const title = document.createElement('span');
      title.textContent = chat.title;
      item.appendChild(title);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-btn';
      deleteBtn.innerHTML = '×';
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        if (confirm(`Are you sure you want to delete "${chat.title}"?`)) {
          deleteChat(chat.id);
        }
      };
      item.appendChild(deleteBtn);
      historyList.appendChild(item);
    });
  }

  /**
   * Creates a message element but doesn't add it to the DOM
   * @param {string} role - 'user' or 'assistant'
   * @returns {HTMLElement} - The created message element
   */
  function createMessageElement(role) {
    const messageEl = document.createElement("div");
    messageEl.className = `message ${role}-message`;
    return messageEl;
  }

  /**
   * Adds a complete message to the chat display
   * @param {string} role - 'user' or 'assistant'
   * @param {string} content - The message content
   * @param {boolean} isBatch - True if adding as part of a full history load
   */
  function addMessageToChat(role, content, isBatch = false) {
    const messageEl = createMessageElement(role);
    renderMessageContent(messageEl, content, true);
    chatMessages.appendChild(messageEl);
    if (!isBatch) {
      scrollToBottom();
    }
  }

  /**
   * Renders the content of a message, handling markdown and code highlighting
   * @param {HTMLElement} messageEl - The message element to render content into
   * @param {string} content - The raw message content
   * @param {boolean} final - Whether this is the final render for the message
   */
  function renderMessageContent(messageEl, content, final = false) {
    // 将换行符转换为HTML换行标签
    let formattedContent = content.replace(/\n/g, '<br>');
    
    // Basic markdown for bold and italics
    formattedContent = formattedContent
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Handle code blocks
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
    formattedContent = formattedContent.replace(codeBlockRegex, (match, lang, code) => {
      const language = lang || 'plaintext';
      const highlightedCode = hljs.highlight(code, { language, ignoreIllegals: true }).value;
      return `<pre><div class="pre-header"><span class="lang">${language}</span><button class="copy-btn">Copy</button></div><code class="language-${language}">${highlightedCode}</code></pre>`;
    });
    
    // Handle inline code
    formattedContent = formattedContent.replace(/`([^`]+)`/g, '<code>$1</code>');

    messageEl.innerHTML = formattedContent;

    if (final) {
      messageEl.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const code = btn.closest('pre').querySelector('code').textContent;
          navigator.clipboard.writeText(code).then(() => {
            btn.textContent = 'Copied!';
            setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
          });
        });
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
