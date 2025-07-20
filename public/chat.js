/**
 * LLM Chat App Frontend
 *
 * Handles the chat UI interactions and communication with the backend API.
 */

// DOM elements
const chatMessages = document.getElementById("chat-messages");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");
const typingIndicator = document.getElementById("typing-indicator");
const sidebar = document.getElementById("sidebar");
const toggleBtn = document.getElementById("toggle-btn");
const historyList = document.getElementById("history-list");

// Chat state
let chatHistory = [
  {
    role: "assistant",
    content:
      "Hello! I'm an LLM chat app powered by Cloudflare Workers AI. How can I help you today?",
  },
];
let isProcessing = false;
let currentChatId = Date.now().toString();
let chats = JSON.parse(localStorage.getItem('chats') || '{}');

// Auto-resize textarea as user types
userInput.addEventListener("input", function () {
  this.style.height = "auto";
  this.style.height = this.scrollHeight + "px";
});

// Send message on Enter (without Shift)
userInput.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Send button click handler
sendButton.addEventListener("click", sendMessage);

/**
 * Sends a message to the chat API and processes the response
 */
async function sendMessage() {
  const message = userInput.value.trim();

  // Don't send empty messages
  if (message === "" || isProcessing) return;

  // Disable input while processing
  isProcessing = true;
  userInput.disabled = true;
  sendButton.disabled = true;

  // Add user message to chat
  addMessageToChat("user", message);

  // Clear input
  userInput.value = "";
  userInput.style.height = "auto";

  // Show typing indicator
  typingIndicator.classList.add("visible");

  // Add message to history
  chatHistory.push({ role: "user", content: message });
  
  // Save current chat
  saveChat();

  try {
    // Create new assistant response element
    const assistantMessageEl = document.createElement("div");
    assistantMessageEl.className = "message assistant-message";
    assistantMessageEl.innerHTML = "<p></p>";
    chatMessages.appendChild(assistantMessageEl);

    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Send request to API
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: chatHistory,
      }),
    });

    // Handle errors
    if (!response.ok) {
      throw new Error("Failed to get response");
    }

    // Process streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let responseText = "";

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      // Decode chunk
      const chunk = decoder.decode(value, { stream: true });

      // Process SSE format
      const lines = chunk.split("\n");
      for (const line of lines) {
        try {
          const jsonData = JSON.parse(line);
          if (jsonData.response) {
            // Append new content to existing text
            responseText += jsonData.response;
            assistantMessageEl.querySelector("p").textContent = responseText;

            // Scroll to bottom
            chatMessages.scrollTop = chatMessages.scrollHeight;
          }
        } catch (e) {
          console.error("Error parsing JSON:", e);
        }
      }
    }

    // Add completed response to chat history
    chatHistory.push({ role: "assistant", content: responseText });
    // Save chat after response
    saveChat();
    // Update history list
    updateHistoryList();
  } catch (error) {
    console.error("Error:", error);
    addMessageToChat(
      "assistant",
      "Sorry, there was an error processing your request.",
    );
  } finally {
    // Hide typing indicator
    typingIndicator.classList.remove("visible");

    // Re-enable input
    isProcessing = false;
    userInput.disabled = false;
    sendButton.disabled = false;
    userInput.focus();
  }
}

// Toggle sidebar
toggleBtn.addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
});

// Save chat to localStorage
function saveChat() {
  chats[currentChatId] = {
    id: currentChatId,
    title: chatHistory[0].content.substring(0, 30),
    history: [...chatHistory]
  };
  localStorage.setItem('chats', JSON.stringify(chats));
}

// Load chat from history
function loadChat(chatId) {
  if (chats[chatId]) {
    currentChatId = chatId;
    chatHistory = [...chats[chatId].history];
    
    // Clear current messages
    chatMessages.innerHTML = '';
    
    // Render loaded messages
    chatHistory.forEach(msg => {
      addMessageToChat(msg.role, msg.content);
    });
  }
}

// Update history list
function updateHistoryList() {
  historyList.innerHTML = '';
  Object.values(chats).forEach(chat => {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.textContent = chat.title;
    item.addEventListener('click', () => loadChat(chat.id));
    historyList.appendChild(item);
  });
}

// Initialize
updateHistoryList();

/**
 * Helper function to add message to chat
 */
function addMessageToChat(role, content) {
  const messageEl = document.createElement("div");
  messageEl.className = `message ${role}-message`;
  
  // Create message content container
  const contentEl = document.createElement("div");
  contentEl.className = 'message-content';
  
  // Format content: replace code blocks with <pre><code> and language class
  let formattedContent = content;
  // Handle multi-line code blocks with optional language identifier
  formattedContent = formattedContent.replace(/```(\w*)\n([\s\S]*?)```/g, function(match, lang, code) {
    if (lang) {
      return `<pre><code class="language-${lang}">${code}</code></pre>`;
    }
    return `<pre><code>${code}</code></pre>`;
  });
  // Handle single-line code blocks
  formattedContent = formattedContent.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  contentEl.innerHTML = `<p>${formattedContent}</p>`;
  
  // Append content
  messageEl.appendChild(contentEl);
  chatMessages.appendChild(messageEl);

  // Highlight code blocks and add copy buttons
  contentEl.querySelectorAll('pre').forEach((pre) => {
    const code = pre.querySelector('code');
    hljs.highlightElement(code);
    
    // Add copy button
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = '复制';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(code.textContent)
        .then(() => {
          copyBtn.textContent = '已复制!';
          setTimeout(() => {
            copyBtn.textContent = '复制';
          }, 2000);
        })
        .catch(err => {
          console.error('复制失败:', err);
        });
    });
    pre.appendChild(copyBtn);
  });

  // Scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
