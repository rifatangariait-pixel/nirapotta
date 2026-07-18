import React, { useState, useEffect } from 'react';

// Normalize any Google Drive / sharing URL into a directly renderable image source
export function normalizeAvatarUrl(url: string | undefined): string {
  if (!url) return '';
  const trimmedUrl = url.trim();

  // If it's already a base64/data URL, keep it as-is
  if (trimmedUrl.startsWith('data:')) {
    return trimmedUrl;
  }

  // Google Drive url patterns
  const driveFileRegex = /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/;
  const driveUcRegex = /drive\.google\.com\/uc\?.*id=([a-zA-Z0-9_-]+)/;
  const driveOpenRegex = /drive\.google\.com\/open\?.*id=([a-zA-Z0-9_-]+)/;

  let fileId = '';
  let match = trimmedUrl.match(driveFileRegex);
  if (match) {
    fileId = match[1];
  } else {
    match = trimmedUrl.match(driveUcRegex);
    if (match) {
      fileId = match[1];
    } else {
      match = trimmedUrl.match(driveOpenRegex);
      if (match) {
        fileId = match[1];
      }
    }
  }

  if (fileId) {
    // lh3.googleusercontent.com/d/FILE_ID is the most robust, CORS-friendly direct image url for Google Drive files
    return `https://lh3.googleusercontent.com/d/${fileId}`;
  }

  return trimmedUrl;
}

export function getInitials(name: string): string {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// Generate a consistent, aesthetic background color based on name
function getAvatarBgColor(name: string): string {
  const colors = [
    'bg-indigo-600 text-white',
    'bg-emerald-600 text-white',
    'bg-blue-600 text-white',
    'bg-amber-600 text-white',
    'bg-purple-600 text-white',
    'bg-rose-600 text-white',
    'bg-pink-600 text-white',
    'bg-cyan-600 text-white',
    'bg-teal-600 text-white',
    'bg-violet-600 text-white'
  ];
  
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
}

interface UserAvatarProps {
  url?: string;
  name: string;
  className?: string;
  size?: string;
}

const UserAvatar: React.FC<UserAvatarProps> = ({ url, name, className = 'w-12 h-12', size }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const normalizedUrl = normalizeAvatarUrl(url);

  // Reset image error status when url changes
  useEffect(() => {
    setImgFailed(false);
  }, [url]);

  const initials = getInitials(name);
  const bgClass = getAvatarBgColor(name);

  if (!normalizedUrl || imgFailed) {
    return (
      <div 
        id="avatar-fallback"
        className={`${className} rounded-full flex items-center justify-center font-bold tracking-wider select-none shrink-0 ${bgClass}`}
        style={size ? { width: size, height: size, fontSize: `calc(${size} * 0.38)` } : undefined}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      id="avatar-image"
      src={normalizedUrl}
      alt={name}
      onError={() => {
        console.warn(`Failed to load avatar image: ${normalizedUrl}`);
        setImgFailed(true);
      }}
      referrerPolicy="no-referrer"
      className={`${className} rounded-full object-cover shrink-0 border border-slate-100`}
      style={size ? { width: size, height: size } : undefined}
    />
  );
};

export default UserAvatar;
