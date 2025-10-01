// script.js
const socket = io();
let username = null;
let roomId = null;
const TENOR_KEY = "LIVDSRZULELA"; // free Tenor API key

// Elements
const joinScreen = document.getElementById("joinScreen");
const chatScreen = document.getElementById("chatScreen");
const chatBox = document.getElementById("chatBox");
const chatInput = document.getElementById("chatInput");
const emojiPicker = document.getElementById("emojiPicker");
const gifModal = document.getElementById("gifModal");
const gifResults = document.getElementById("gifResults");
const typingIndicator = document.getElementById("typingIndicator");

const usersColors = {}; // track consistent colors per user

// ---------- Join / Create Room ----------
document.getElementById("createRoom").onclick = () => {
  username = document.getElementById("username").value.trim() || "Guest";
  const inputRoom = document.getElementById("roomId").value.trim();
  roomId = inputRoom || "room-" + Math.random().toString(36).substr(2,6);
  enterRoom();
};

document.getElementById("joinRoom").onclick = () => {
  username = document.getElementById("username").value.trim() || "Guest";
  roomId = document.getElementById("roomId").value.trim();
  if(!roomId) return alert("Enter a Room ID!");
  enterRoom();
};

function enterRoom() {
  socket.emit("join", roomId, username);
  document.getElementById("roomTitle").textContent = `Room: ${roomId}`;
  joinScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");
}

document.getElementById("leaveBtn").onclick = () => location.reload();

// ---------- Typing ----------
let typingTimeout;
chatInput.addEventListener("input", () => {
  socket.emit("typing", true);
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => socket.emit("typing", false), 1500);
});

socket.on("typing", ({ username: user, typing }) => {
  typingIndicator.textContent = typing ? `${user} is typing...` : "";
});

// ---------- Send / Receive ----------
document.getElementById("sendBtn").onclick = sendMessage;
chatInput.addEventListener("keypress", e => { if(e.key==="Enter") sendMessage(); });

function sendMessage() {
  const text = chatInput.value.trim();
  if(!text) return;
  const msg = { user: username, text, time: new Date().toLocaleTimeString() };
  socket.emit("chat", msg);
  chatInput.value = "";
  emojiPicker.classList.add("hidden");
}

// ---------- Append Chat ----------
socket.on("chat", msg => appendChat(msg));

function appendChat(msg) {
  const isOwn = msg.user === username;
  if(!usersColors[msg.user] && msg.user!=="System") {
    usersColors[msg.user] = `hsl(${Math.floor(Math.random()*360)}, 70%, 50%)`;
  }

  const div = document.createElement("div");
  div.className = `flex ${isOwn ? "justify-end" : "justify-start"} items-end space-x-2`;

  // Avatar
  if(!isOwn && msg.user!=="System") {
    const avatar = document.createElement("div");
    avatar.className = "w-8 h-8 flex items-center justify-center rounded-full text-white font-bold text-sm";
    avatar.style.backgroundColor = usersColors[msg.user];
    avatar.textContent = msg.user[0].toUpperCase();
    div.appendChild(avatar);
  }

  const bubble = document.createElement("div");
  bubble.setAttribute("data-msg-id", msg.id);
  const bubbleClass = msg.user==="System"
    ? "bg-gray-600 text-gray-200 rounded-xl px-4 py-2"
    : isOwn
      ? "bg-pink-500 text-white rounded-br-none px-4 py-2"
      : "bg-gradient-to-r from-blue-600 to-teal-500 text-white rounded-bl-none px-4 py-2";
  bubble.className = `shadow ${bubbleClass} relative cursor-pointer`;

  bubble.innerHTML = msg.text.match(/\.(gif|jpg|png)$/i)
    ? `<img src="${msg.text}" class="rounded-lg max-w-[200px]"><span class="block text-xs text-gray-200 mt-1">${msg.user} • ${msg.time}</span>`
    : `<span class="block text-sm">${msg.text}</span><span class="block text-xs text-gray-200 mt-1">${msg.user} • ${msg.time}</span>`;

  // Click to react
  bubble.addEventListener("click", () => {
    const reaction = prompt("Enter emoji to react:");
    if (reaction) socket.emit("reaction", { messageId: msg.id, emoji: reaction });
  });

  div.appendChild(bubble);
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;

  // Track read receipts
  if (isOwn) socket.emit("read", msg.id);
}

// ---------- Reactions ----------
socket.on("reaction", ({ messageId, emoji, username: user }) => {
  const bubble = Array.from(chatBox.children).find(div =>
    div.querySelector("div") && div.querySelector("div").getAttribute("data-msg-id") === messageId
  );
  if (!bubble) return;

  let reactionsDiv = bubble.querySelector(".reactions");
  if (!reactionsDiv) {
    reactionsDiv = document.createElement("div");
    reactionsDiv.className = "flex space-x-1 mt-1 reactions";
    bubble.querySelector("div").appendChild(reactionsDiv);
  }

  const emojiSpan = document.createElement("span");
  emojiSpan.textContent = `${emoji} (${user})`;
  emojiSpan.className = "text-xs";
  reactionsDiv.appendChild(emojiSpan);
});

// ---------- Read receipts ----------
socket.on("readUpdate", (roomUsers) => {
  Array.from(chatBox.children).forEach(div => {
    const bubble = div.querySelector("div");
    if (!bubble) return;
    const bubbleId = bubble.getAttribute("data-msg-id");
    if (!bubbleId) return;

    const existing = bubble.querySelector(".read-check");
    if (existing) existing.remove();

    const readers = Object.values(roomUsers).filter(u => u.lastReadId === bubbleId && u.username !== username);
    if (readers.length > 0) {
      const check = document.createElement("span");
      check.className = "read-check text-xs text-gray-200 ml-1";
      check.textContent = `✔${readers.length>1?"✔":""}`;
      bubble.appendChild(check);
    }
  });
});

// ---------- Emoji Picker ----------
const emojiBtn = document.getElementById("emojiBtn");
emojiBtn.onclick = () => {
  const rect = chatInput.getBoundingClientRect();
  emojiPicker.style.position = "absolute";
  emojiPicker.style.bottom = `${window.innerHeight - rect.top + 10}px`;
  emojiPicker.style.left = `${rect.left}px`;
  emojiPicker.classList.toggle("hidden");
};

emojiPicker.addEventListener("emoji-click", e => {
  chatInput.value += e.detail.unicode;
  emojiPicker.classList.add("hidden");
});

// ---------- GIF Modal ----------
document.getElementById("gifBtn").onclick = () => gifModal.classList.remove("hidden");
document.getElementById("closeGif").onclick = () => {
  gifModal.classList.add("hidden");
  gifResults.innerHTML = "";
};

document.getElementById("gifSearch").addEventListener("keypress", async e => {
  if (e.key !== "Enter") return;
  const query = e.target.value.trim();
  if (!query) return;
  gifResults.innerHTML = "Loading...";
  const res = await fetch(`https://g.tenor.com/v1/search?q=${query}&key=${TENOR_KEY}&limit=10`);
  const data = await res.json();
  gifResults.innerHTML = "";
  data.results.forEach(gif => {
    const img = document.createElement("img");
    img.src = gif.media[0].gif.url;
    img.className = "w-full h-24 object-cover rounded cursor-pointer hover:opacity-80";
    img.onclick = () => {
      const msg = { user: username, text: img.src, time: new Date().toLocaleTimeString() };
      socket.emit("chat", msg);
      gifModal.classList.add("hidden");
      gifResults.innerHTML = "";
    };
    gifResults.appendChild(img);
  });
});
