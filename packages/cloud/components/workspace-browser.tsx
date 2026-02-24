'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  FolderClosed, File, FileCode, FileText, FileImage, FileJson,
  ChevronRight, Download, X, Loader2, ArrowLeft, Home,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
}

interface WorkspaceBrowserProps {
  sessionId: string;
  isOpen: boolean;
  onClose: () => void;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const CODE_EXTS = new Set(['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'rb', 'java', 'c', 'cpp', 'h', 'cs', 'php', 'swift', 'kt', 'sh', 'bash', 'zsh', 'css', 'scss', 'html', 'vue', 'svelte']);
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp']);
const DATA_EXTS = new Set(['json', 'yaml', 'yml', 'toml', 'xml', 'csv']);

function FileIcon({ name, type }: { name: string; type: 'file' | 'directory' }) {
  if (type === 'directory') {
    return <FolderClosed className="w-4 h-4 text-zinc-500 flex-shrink-0" />;
  }
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  if (CODE_EXTS.has(ext)) return <FileCode className="w-4 h-4 text-zinc-500 flex-shrink-0" />;
  if (IMAGE_EXTS.has(ext)) return <FileImage className="w-4 h-4 text-zinc-500 flex-shrink-0" />;
  if (DATA_EXTS.has(ext)) return <FileJson className="w-4 h-4 text-zinc-500 flex-shrink-0" />;
  if (ext === 'md' || ext === 'txt') return <FileText className="w-4 h-4 text-zinc-500 flex-shrink-0" />;
  return <File className="w-4 h-4 text-zinc-500 flex-shrink-0" />;
}

export function WorkspaceBrowser({ sessionId, isOpen, onClose }: WorkspaceBrowserProps) {
  const [currentPath, setCurrentPath] = useState('/workspace');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [downloading, setDownloading] = useState<Set<string>>(new Set());

  useEffect(() => { setMounted(true); }, []);

  const fetchFiles = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sandbox/files?sessionId=${sessionId}&path=${encodeURIComponent(path)}`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to list files');
        setFiles([]);
        return;
      }
      const data = await res.json();
      setFiles(data.files || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch files');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (isOpen) fetchFiles(currentPath);
  }, [isOpen, currentPath, fetchFiles]);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';

    const panel = document.getElementById('workspace-browser-panel');
    const isInsidePanel = (target: EventTarget | null) =>
      panel?.contains(target as Node);

    const preventWheel = (e: WheelEvent) => {
      if (!isInsidePanel(e.target)) e.preventDefault();
    };
    const preventTouch = (e: TouchEvent) => {
      if (!isInsidePanel(e.target)) e.preventDefault();
    };

    document.addEventListener('wheel', preventWheel, { passive: false });
    document.addEventListener('touchmove', preventTouch, { passive: false });
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('wheel', preventWheel);
      document.removeEventListener('touchmove', preventTouch);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const navigateTo = (path: string) => setCurrentPath(path);

  const goUp = () => {
    if (currentPath === '/workspace') return;
    const parent = currentPath.substring(0, currentPath.lastIndexOf('/')) || '/workspace';
    setCurrentPath(parent);
  };

  const triggerDownload = async (url: string, filename: string, key: string) => {
    setDownloading((prev) => new Set(prev).add(key));
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      // silent — user sees the spinner stop
    } finally {
      setDownloading((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const downloadFile = (path: string) => {
    const filename = path.split('/').pop() || 'download';
    triggerDownload(`/api/sandbox/file?sessionId=${sessionId}&path=${encodeURIComponent(path)}`, filename, path);
  };

  const downloadFolder = (path: string) => {
    const folderName = path.split('/').pop() || 'download';
    triggerDownload(`/api/sandbox/folder?sessionId=${sessionId}&path=${encodeURIComponent(path)}`, `${folderName}.zip`, path);
  };

  const pathParts = currentPath.replace('/workspace', '').split('/').filter(Boolean);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-2 rounded-2xl bg-black/60 z-[100]"
            style={{ touchAction: 'none' }}
            onClick={onClose}
          />

          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            drag="x"
            dragConstraints={{ left: 0, right: 384 }}
            dragElastic={0}
            onDragEnd={(_, info) => {
              if (info.offset.x > 80 || info.velocity.x > 500) {
                onClose();
              }
            }}
            id="workspace-browser-panel"
            className="fixed inset-y-0 right-0 w-80 sm:w-96 z-[101] overflow-visible"
          >
            <div className="h-full overflow-hidden flex flex-col pt-[9px]" style={{ background: '#0a0e14' }}>
              <div className="flex items-center gap-3 px-5 h-14 border-b border-white/[0.06] flex-shrink-0">
                <span className="text-sm font-medium text-zinc-300 flex-1">Files</span>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-1.5 px-5 h-10 border-b border-white/[0.06] flex-shrink-0 overflow-x-auto scrollbar-none">
                {currentPath !== '/workspace' && (
                  <button
                    onClick={goUp}
                    className="p-1 rounded-md text-zinc-600 hover:text-zinc-400 hover:bg-white/[0.06] transition-colors flex-shrink-0"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => navigateTo('/workspace')}
                  className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0"
                >
                  <Home className="w-3 h-3" />
                </button>
                {pathParts.map((part, i) => (
                  <span key={i} className="flex items-center gap-1.5 flex-shrink-0">
                    <ChevronRight className="w-3 h-3 text-zinc-700" />
                    <button
                      onClick={() => navigateTo('/workspace/' + pathParts.slice(0, i + 1).join('/'))}
                      className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors font-mono"
                    >
                      {part}
                    </button>
                  </span>
                ))}
                <div className="flex-1" />
                <button
                  onClick={() => downloadFolder(currentPath)}
                  disabled={downloading.has(currentPath)}
                  className="p-1 rounded-md text-zinc-600 hover:text-zinc-400 hover:bg-white/[0.06] transition-colors flex-shrink-0 disabled:opacity-50"
                  title="Download this folder as .zip"
                >
                  {downloading.has(currentPath)
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Download className="w-3.5 h-3.5" />}
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-1">
                {loading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-4 h-4 text-zinc-600 animate-spin" />
                  </div>
                ) : error ? (
                  <div className="px-5 py-12 text-center">
                    <p className="text-sm text-zinc-500">{error}</p>
                    <button
                      onClick={() => fetchFiles(currentPath)}
                      className="mt-3 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                    >
                      Retry
                    </button>
                  </div>
                ) : files.length === 0 ? (
                  <div className="px-5 py-12 text-center text-sm text-zinc-600">
                    Empty directory
                  </div>
                ) : (
                  files.map((file) => (
                    <div
                      key={file.path}
                      className="group flex items-center gap-3 mx-1 px-4 py-2.5 rounded-lg hover:bg-white/[0.04] transition-colors cursor-default min-h-[44px]"
                    >
                      <FileIcon name={file.name} type={file.type} />

                      {file.type === 'directory' ? (
                        <button
                          onClick={() => navigateTo(file.path)}
                          className="flex-1 text-left text-sm text-zinc-300 hover:text-white truncate transition-colors"
                        >
                          {file.name}
                        </button>
                      ) : (
                        <span className="flex-1 text-sm text-zinc-400 truncate">
                          {file.name}
                        </span>
                      )}

                      <span className="text-[10px] text-zinc-600 flex-shrink-0 tabular-nums font-mono">
                        {file.type === 'file' ? formatSize(file.size) : ''}
                      </span>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          file.type === 'directory' ? downloadFolder(file.path) : downloadFile(file.path);
                        }}
                        disabled={downloading.has(file.path)}
                        className="p-1.5 rounded-md opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.06] transition-all disabled:opacity-100"
                        title={file.type === 'directory' ? 'Download as .zip' : 'Download'}
                      >
                        {downloading.has(file.path)
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Download className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div
              className="absolute top-2 -left-4 w-4 h-4 pointer-events-none"
              style={{ background: 'radial-gradient(circle at 0 100%, transparent 16px, #0a0e14 16px)' }}
            />
            <div
              className="absolute bottom-2 -left-4 w-4 h-4 pointer-events-none"
              style={{ background: 'radial-gradient(circle at 0 0, transparent 16px, #0a0e14 16px)' }}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
