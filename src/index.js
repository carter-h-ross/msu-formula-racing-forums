/* 3d model credits:

chess board: "Chess Board" (https://skfb.ly/6SAZ9) by danielpaulse is licensed under Creative Commons Attribution-ShareAlike (http://creativecommons.org/licenses/by-sa/4.0/).
*/

// function to help with radians
function degToRad(degrees) {
  return degrees * (Math.PI / 180);
}

function copy2DArray(array) {
  return array.map(innerArray => innerArray.slice());
}

/*--------------------------------------- firebase ----------------------------------------*/ 
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore, doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';

import '@babel/polyfill';
import axios from 'axios';

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyA8VMJv3mFnek1zQbEHfyQlvclBu-Dzi3o",
  authDomain: "msu-fsae-forum.firebaseapp.com",
  projectId: "msu-fsae-forum",
  storageBucket: "msu-fsae-forum.firebasestorage.app",
  messagingSenderId: "816620078519",
  appId: "1:816620078519:web:f43ced8b09ed5db912d432",
  measurementId: "G-C3GG1YM4WS"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const df = getFirestore(app);
const auth = getAuth();

let userId = null;
let username = null;
const mainMenuDiv = document.querySelector(".home-menu");

const signupButton = document.getElementById('signup-button');
const loginButton = document.getElementById('login-button');
const rememberMeCheck = document.querySelector('.remember-me-check');
const emailInput = document.querySelector('.email-input');
const passwordInput = document.querySelector('.password-input');
const usernameInput = document.querySelector('.username-input');
let rememberMe = rememberMeCheck.checked;

// Load saved credentials
if (
  localStorage.getItem("savedEmail") &&
  localStorage.getItem("savedPassword") &&
  localStorage.getItem("savedUsername")
) {
  emailInput.value = localStorage.getItem("savedEmail");
  passwordInput.value = localStorage.getItem("savedPassword");
  usernameInput.value = localStorage.getItem("savedUsername");
  rememberMeCheck.checked = true;
}

/*--------------------------------------- Backblaze B2 Setup ----------------------------------------*/

async function getUploadDetails() {
  const response = await axios.get('/api/get-upload-url');
  return response.data;
}

async function uploadFileToB2(file, fileNamePrefix = "") {
  try {
    const { uploadUrl, uploadAuthToken, downloadUrl } = await getUploadDetails();

    const fileName = `${fileNamePrefix}${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
    const contentType = file.type || "application/octet-stream";

    const response = await axios.post(uploadUrl, file, {
      headers: {
        Authorization: uploadAuthToken,
        'Content-Type': contentType,
        'X-Bz-File-Name': encodeURIComponent(fileName),
        'X-Bz-Content-Sha1': 'do_not_verify'
      }
    });

    const fileUrl = `${downloadUrl}/file/${B2_BUCKET_NAME}/${encodeURIComponent(fileName)}`;

    return {
      fileName,
      fileUrl,
      contentType,
      size: file.size
    };
  } catch (err) {
    console.error("Upload error:", err);
    throw err;
  }
}

// SIGNUP
signupButton.addEventListener('click', async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  const username = usernameInput.value.trim();
  rememberMe = rememberMeCheck.checked;

  if (!username) {
    console.log("Username is required.");
    usernameInput.value = "must enter when creating account";
    return;
  }

  if (!email || !password) {
    console.log("Email and password cannot be empty.");
    return;
  }

  if (password.length < 6) {
    console.log("Password must be at least 6 characters.");
    return;
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    userId = cred.user.uid;
    console.log("User signed up:", userId);

    await setDoc(doc(df, "users", userId), {
      email: email,
      username: username,
      profileImageLink: "",
      forumQuote: "",
      role: "no role",
      createdAt: serverTimestamp(),
      approved: false,
      admin: false,
    });

    if (rememberMe) {
      localStorage.setItem("savedEmail", email);
      localStorage.setItem("savedPassword", password);
      localStorage.setItem("savedUsername", username);
    }

    emailInput.value = '';
    passwordInput.value = '';
    usernameInput.value = '';

    // Show approval message
    document.querySelector(".form-fields").style.display = "none";
    document.getElementById("approval-message").style.display = "block";

  } catch (err) {
    console.error("Login error:", err.message);
  }

});

// LOGIN
loginButton.addEventListener('click', async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  const inputUsername = usernameInput.value.trim();
  rememberMe = rememberMeCheck.checked;

  if (!email || !password || !inputUsername) {
    alert("Please fill in all fields.");
    return;
  }

  try {
    // First, attempt to sign in with email/password
    const cred = await signInWithEmailAndPassword(auth, email, password);
    userId = cred.user.uid;

    // Now fetch the user profile
    const userRef = doc(df, "users", userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      alert("User profile not found in database.");
      return;
    }

    const userData = userSnap.data();

    // Check if the entered username matches the one in the database
    if (userData.username !== inputUsername) {
      alert("Incorrect username. Please enter the username associated with this email.");
      return;
    }

    // Save credentials if needed
    if (rememberMe) {
      localStorage.setItem("savedEmail", email);
      localStorage.setItem("savedPassword", password);
      localStorage.setItem("savedUsername", inputUsername);
    } else {
      localStorage.removeItem("savedEmail");
      localStorage.removeItem("savedPassword");
      localStorage.removeItem("savedUsername");
    }

    emailInput.value = '';
    passwordInput.value = '';
    usernameInput.value = '';

    // Continue to forum
    if (userData.approved === true) {
      showForumHome();
    } else {
      document.querySelector(".form-fields").style.display = "none";
      document.getElementById("approval-message").style.display = "block";
    }

  } catch (err) {
    if (err.code === "auth/user-not-found") {
      alert("No account found with this email. Please sign up first.");
    } else if (err.code === "auth/wrong-password") {
      alert("Incorrect password. Please try again.");
    } else {
      alert("Login failed: " + err.message);
    }
    console.error("Login error:", err.message);
  }
});

document.getElementById("back-to-login-button").addEventListener("click", () => {
  document.getElementById("approval-message").style.display = "none";
  document.querySelector(".form-fields").style.display = "flex";
});

// ---- Slideshow background setup ----

const slideshowImages = [
  "front_page_slideshow/slideshow_image1.jpg",
  "front_page_slideshow/slideshow_image2.jpg",
  "front_page_slideshow/slideshow_image3.jpg"
];

let currentSlide = 0;
let showingA = true;

const imgA = document.getElementById("slideA");
const imgB = document.getElementById("slideB");

function crossfadeSlideshow() {
  const nextImage = slideshowImages[currentSlide];
  const incomingImg = showingA ? imgB : imgA;
  const outgoingImg = showingA ? imgA : imgB;

  incomingImg.src = nextImage;
  incomingImg.style.opacity = 1;
  outgoingImg.style.opacity = 0;

  currentSlide = (currentSlide + 1) % slideshowImages.length;
  showingA = !showingA;
}

if (imgA && imgB && slideshowImages.length > 0) {
  imgA.src = slideshowImages[0];
  imgA.style.opacity = 1;
  currentSlide = 1;

  setInterval(crossfadeSlideshow, 5000);
}

// forum stuff

const forumContainer = document.getElementById("forum-container");
let navToken = 0;

// Static topic list — these will not change
const topicCategories = [
  "General Discussion",
  "Team Documents",
  "Technical Discussion",
  "Fabrication",
  "Testing",
  "Parts, Materials and Orders",
  "Operations",
  "Support",
  "Alumni Discussion",
  "Engineering Chat"
];

async function showForumHome() {
  mainMenuDiv.style.display = "none";
  forumContainer.style.display = "block";
  const myToken = ++navToken;

  forumContainer.innerHTML = '<div class="forum-header">Michigan State University Formula Racing</div>';

  for (const category of topicCategories) {
    let postCount = 0;
    let topicCount = 0;
    let latestInfo = "No posts yet";

    const postsRef = collection(df, "posts");
    const categoryPostsQuery = query(postsRef, where("category", "==", category));
    const snapshot = await getDocs(categoryPostsQuery);

    if (myToken !== navToken) return;

    const titles = new Set();
    let latestPost = null;

    snapshot.forEach(doc => {
      const post = doc.data();
      postCount++;
      if (post.topic) titles.add(post.topic);
      if (!latestPost || (post.createdAt?.seconds ?? 0) > (latestPost.createdAt?.seconds ?? 0)) {
        latestPost = post;
      }
    });

    topicCount = titles.size;

    if (latestPost) {
      const ts = latestPost.createdAt?.toDate();
      const timeString = ts ? ts.toLocaleDateString() + " " + ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "unknown time";
      latestInfo = `by ${latestPost.author || "unknown"} on ${timeString}`;
    }

    const section = document.createElement("div");
    section.className = "forum-section";
    section.innerHTML = `
      <h2>${category}</h2>
      <div class="topic-info">
        <div><strong>Topics:</strong> ${topicCount}, <strong>Posts:</strong> ${postCount}</div>
        <div><em>${latestInfo}</em></div>
      </div>
    `;

    section.addEventListener('click', () => showTopicsInCategory(category));
    forumContainer.appendChild(section);
  }
}

async function showTopicsInCategory(categoryName) {
  const myToken = ++navToken;

  forumContainer.innerHTML = `
    <div class="forum-header">${categoryName}</div>
    <button id="create-button" class="forum-button">+ New Topic</button>
    <button id="back-button" class="forum-button">← Back</button>
    <div id="topics-list"></div>
  `;

  document.getElementById("create-button").addEventListener("click", () => {
    showNewTopicForm(categoryName);
  });

  document.getElementById("back-button").addEventListener("click", () => {
    showForumHome();
  });

  const topicsListDiv = document.getElementById('topics-list');
  const topicsRef = collection(df, "topics");
  const q = query(topicsRef, where("category", "==", categoryName), orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);

  if (myToken !== navToken) return;

  if (snapshot.empty) {
    topicsListDiv.innerHTML = "<p>No topics yet.</p>";
    return;
  }

  snapshot.forEach(doc => {
    const topic = doc.data();
    const ts = topic.createdAt?.toDate();
    const timeStr = ts ? ts.toLocaleDateString() + " " + ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "unknown time";
    const div = document.createElement("div");
    div.className = "forum-section";
    div.innerHTML = `
      <h3>${topic.title}</h3>
      <div class="topic-info">by ${topic.authorName || 'unknown'} on ${timeStr}</div>
    `;
    div.addEventListener('click', () => showPostsInTopic(doc.id, topic.title, categoryName));
    topicsListDiv.appendChild(div);
  });
}

async function showPostsInTopic(topicId, topicTitle, categoryName) {
  const myToken = ++navToken;

  forumContainer.innerHTML = `
    <div class="forum-header">${topicTitle}</div>
    <button id="create-button" class="forum-button">+ New Post</button>
    <button id="back-button" class="forum-button">← Back</button>
    <div id="posts-list"></div>
  `;

  document.getElementById("create-button").addEventListener("click", () => {
    showNewPostForm(topicId, topicTitle, categoryName);
  });

  document.getElementById("back-button").addEventListener("click", () => {
    showTopicsInCategory(categoryName);
  });

  const postsListDiv = document.getElementById("posts-list");

  const postsRef = collection(df, "posts");
  const q = query(postsRef, where("topicId", "==", topicId), orderBy("createdAt", "asc"));
  const snapshot = await getDocs(q);

  if (myToken !== navToken) return;

  if (snapshot.empty) {
    postsListDiv.innerHTML = "<p>No posts yet.</p>";
    return;
  }

  snapshot.forEach(doc => {
    const post = doc.data();
    const ts = post.createdAt?.toDate();
    const timeStr = ts ? ts.toLocaleDateString() + " " + ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "unknown time";
    const div = document.createElement("div");
    div.className = "forum-section";
    
    let attachmentsHtml = '';
    
    if (post.imageUrl) {
      attachmentsHtml += `
        <div class="attachment">
          <div class="attachment-header">Image Attachment:</div>
          <img src="${post.imageUrl}" alt="Attached image" class="attached-image" onclick="openImageModal('${post.imageUrl}')">
          <a href="${post.imageUrl}" target="_blank" class="download-link">Download</a>
        </div>
      `;
    }
    
    if (post.fileUrl) {
      attachmentsHtml += `
        <div class="attachment">
          <div class="attachment-header">File Attachment:</div>
          <div class="file-info">
            <i class="fas fa-file"></i>
            <span>${post.fileName || 'Download file'}</span>
          </div>
          <a href="${post.fileUrl}" target="_blank" class="download-link">Download</a>
        </div>
      `;
    }
    
    div.innerHTML = `
      <div class="post-header">
        <div class="post-author">${post.authorName || "unknown"}</div>
        <div class="post-time">${timeStr}</div>
      </div>
      <div class="post-content">${post.content}</div>
      ${attachmentsHtml}
    `;
    
    postsListDiv.appendChild(div);
  });
}

function openImageModal(imageUrl) {
  const modal = document.createElement('div');
  modal.className = 'image-modal';
  modal.innerHTML = `
    <div class="modal-content">
      <span class="close-modal" onclick="document.body.removeChild(this.parentNode.parentNode)">×</span>
      <img src="${imageUrl}" alt="Full size">
    </div>
  `;
  document.body.appendChild(modal);
}

function showNewTopicForm(categoryName) {
  const myToken = ++navToken;

  forumContainer.innerHTML = `
    <div class="forum-header">New Topic in ${categoryName}</div>
    <div class="forum-form-container">
      <input type="text" id="new-topic-title" placeholder="Topic Title">
      <textarea id="new-topic-post" placeholder="Your first post..."></textarea>
      
      <div class="file-upload-section">
        <label for="topic-image-upload" class="upload-label">
          <i class="fas fa-image"></i> Attach Image
          <input type="file" id="topic-image-upload" accept="image/*" style="display: none;">
        </label>
        <label for="topic-file-upload" class="upload-label">
          <i class="fas fa-file"></i> Attach File
          <input type="file" id="topic-file-upload" style="display: none;">
        </label>
        <div id="topic-file-preview" class="file-preview"></div>
      </div>
      
      <div style="display: flex; gap: 10px; margin-top: 20px;">
        <button id="post-topic-btn" class="forum-button">Post Topic</button>
        <button id="cancel-topic-btn" class="forum-button">Cancel</button>
      </div>
    </div>
  `;

  // Handle file selection for topic
  const imageUpload = document.getElementById('topic-image-upload');
  const fileUpload = document.getElementById('topic-file-upload');
  const filePreview = document.getElementById('topic-file-preview');
  
  imageUpload.addEventListener('change', handleFileSelection);
  fileUpload.addEventListener('change', handleFileSelection);
  
  function handleFileSelection(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    filePreview.innerHTML = '';
    
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        filePreview.innerHTML = `
          <div class="file-preview-item">
            <img src="${event.target.result}" alt="Preview" class="image-preview">
            <span>${file.name}</span>
            <button class="remove-file-btn" data-type="image">×</button>
          </div>
        `;
      };
      reader.readAsDataURL(file);
    } else {
      filePreview.innerHTML = `
        <div class="file-preview-item">
          <i class="fas fa-file"></i>
          <span>${file.name}</span>
          <button class="remove-file-btn" data-type="file">×</button>
        </div>
      `;
    }
    
    // Add remove file button handler
    document.querySelector('.remove-file-btn').addEventListener('click', () => {
      e.target.value = '';
      filePreview.innerHTML = '';
    });
  }

  document.getElementById("post-topic-btn").addEventListener("click", () => {
    submitNewTopic(categoryName);
  });

  document.getElementById("cancel-topic-btn").addEventListener("click", () => {
    if (myToken === navToken) {
      showTopicsInCategory(categoryName);
    }
  });
}

function showNewPostForm(topicId, topicTitle, categoryName) {
  const myToken = ++navToken;

  forumContainer.innerHTML = `
    <div class="forum-header">Reply to: ${topicTitle}</div>
    <div class="forum-form-container">
      <textarea id="new-post-content" placeholder="Your reply..."></textarea>
      
      <div class="file-upload-section">
        <label for="post-image-upload" class="upload-label">
          <i class="fas fa-image"></i> Attach Image
          <input type="file" id="post-image-upload" accept="image/*" style="display: none;">
        </label>
        <label for="post-file-upload" class="upload-label">
          <i class="fas fa-file"></i> Attach File
          <input type="file" id="post-file-upload" style="display: none;">
        </label>
        <div id="post-file-preview" class="file-preview"></div>
      </div>
      
      <div style="display: flex; gap: 10px; margin-top: 20px;">
        <button id="post-reply-btn" class="forum-button">Post Reply</button>
        <button id="cancel-reply-btn" class="forum-button">Cancel</button>
      </div>
    </div>
  `;

  // Handle file selection for post
  const imageUpload = document.getElementById('post-image-upload');
  const fileUpload = document.getElementById('post-file-upload');
  const filePreview = document.getElementById('post-file-preview');
  
  imageUpload.addEventListener('change', handleFileSelection);
  fileUpload.addEventListener('change', handleFileSelection);
  
  function handleFileSelection(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    filePreview.innerHTML = '';
    
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        filePreview.innerHTML = `
          <div class="file-preview-item">
            <img src="${event.target.result}" alt="Preview" class="image-preview">
            <span>${file.name}</span>
            <button class="remove-file-btn" data-type="image">×</button>
          </div>
        `;
      };
      reader.readAsDataURL(file);
    } else {
      filePreview.innerHTML = `
        <div class="file-preview-item">
          <i class="fas fa-file"></i>
          <span>${file.name}</span>
          <button class="remove-file-btn" data-type="file">×</button>
        </div>
      `;
    }
    
    // Add remove file button handler
    document.querySelector('.remove-file-btn').addEventListener('click', () => {
      e.target.value = '';
      filePreview.innerHTML = '';
    });
  }

  document.getElementById("post-reply-btn").addEventListener("click", () => {
    submitNewPost(topicId, topicTitle, categoryName);
  });

  document.getElementById("cancel-reply-btn").addEventListener("click", () => {
    if (myToken === navToken) {
      showPostsInTopic(topicId, topicTitle, categoryName);
    }
  });
}

async function submitNewTopic(categoryName) {
  const title = document.getElementById('new-topic-title').value.trim();
  const content = document.getElementById('new-topic-post').value.trim();
  if (!title || !content) return alert("Fill out all fields.");

  const imageUpload = document.getElementById('topic-image-upload');
  const fileUpload = document.getElementById('topic-file-upload');
  
  let imageData = null;
  let fileData = null;
  
  // Upload image if selected
  if (imageUpload.files[0]) {
    try {
      imageData = await uploadFileToB2(imageUpload.files[0], `topic_images/`);
    } catch (error) {
      console.error("Failed to upload image:", error);
      return alert("Failed to upload image. Please try again.");
    }
  }
  
  // Upload file if selected
  if (fileUpload.files[0]) {
    try {
      fileData = await uploadFileToB2(fileUpload.files[0], `topic_files/`);
    } catch (error) {
      console.error("Failed to upload file:", error);
      return alert("Failed to upload file. Please try again.");
    }
  }

  const topicRef = doc(collection(df, "topics"));
  const topicId = topicRef.id;

  const authorData = await getDoc(doc(df, "users", userId));
  const authorName = authorData.exists() ? authorData.data().username : "unknown";

  await setDoc(topicRef, {
    title,
    category: categoryName,
    createdAt: serverTimestamp(),
    authorId: userId,
    authorName,
    hasImage: !!imageData,
    hasFile: !!fileData
  });

  await setDoc(doc(df, "posts", `${topicId}-0`), {
    topicId,
    content,
    createdAt: serverTimestamp(),
    authorId: userId,
    authorName,
    category: categoryName,
    imageUrl: imageData ? imageData.fileUrl : null,
    imageName: imageData ? imageData.fileName : null,
    fileUrl: fileData ? fileData.fileUrl : null,
    fileName: fileData ? fileData.fileName : null
  });

  navToken++;  // Invalidate outdated views
  showTopicsInCategory(categoryName);
}

async function submitNewPost(topicId, topicTitle, categoryName) {
  const content = document.getElementById('new-post-content').value.trim();
  if (!content) return alert("Reply cannot be empty.");

  const imageUpload = document.getElementById('post-image-upload');
  const fileUpload = document.getElementById('post-file-upload');
  
  try {
    let imageData = null;
    let fileData = null;
    
    // Upload image if selected
    if (imageUpload.files[0]) {
      try {
        imageData = await uploadFileToB2(imageUpload.files[0], `post_images/`);
      } catch (error) {
        console.error("Image upload failed:", error);
        return alert(`Image upload failed: ${error.response?.data?.message || error.message}`);
      }
    }
    
    // Upload file if selected
    if (fileUpload.files[0]) {
      try {
        fileData = await uploadFileToB2(fileUpload.files[0], `post_files/`);
      } catch (error) {
        console.error("File upload failed:", error);
        return alert(`File upload failed: ${error.response?.data?.message || error.message}`);
      }
    }

    // Rest of your code...
  } catch (error) {
    console.error("Error creating post:", error);
    alert("Failed to create post. Please try again.");
  }
}