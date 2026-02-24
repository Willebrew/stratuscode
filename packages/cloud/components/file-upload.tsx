'use client';

import { useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { useMutation } from 'convex/react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { X, FileText, ImageIcon, Loader2 } from 'lucide-react';
import { useToast } from './toast';

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const TEXT_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.java', '.c', '.cpp', '.h',
  '.md', '.txt', '.json', '.yaml', '.yml', '.toml', '.html', '.css', '.scss',
  '.xml', '.csv', '.sh', '.bash', '.zsh', '.fish', '.sql', '.graphql',
  '.env', '.gitignore', '.dockerfile', '.prisma', '.svelte', '.vue',
];
const DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/rtf',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
];
const DOCUMENT_EXTENSIONS = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.rtf', '.odt', '.ods',
];

export interface AttachedFile {
  id?: Id<'attachments'>;
  storageId?: Id<'_storage'>;
  filename: string;
  mimeType: string;
  size: number;
  url?: string;
  uploading?: boolean;
}

export interface FileUploadHandle {
  open: () => void;
  addFiles: (files: FileList) => void;
}

interface FileUploadProps {
  sessionId: Id<'sessions'>;
  attachedFiles: AttachedFile[];
  onFilesChange: (files: AttachedFile[] | ((prev: AttachedFile[]) => AttachedFile[])) => void;
  disabled?: boolean;
}

export const FileUpload = forwardRef<FileUploadHandle, FileUploadProps>(
  function FileUpload({ sessionId, attachedFiles, onFilesChange, disabled }, ref) {
    const inputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();
    const generateUploadUrl = useMutation(api.attachments.generateUploadUrl);
    const createAttachment = useMutation(api.attachments.create);
    const removeAttachment = useMutation(api.attachments.remove);

    const handleFiles = useCallback(async (fileList: FileList) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;

      for (const file of files) {
        const placeholder: AttachedFile = {
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          uploading: true,
        };
        onFilesChange((prev) => [...prev, placeholder]);

        try {
          const uploadUrl = await generateUploadUrl();
          const res = await fetch(uploadUrl, {
            method: 'POST',
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
            body: file,
          });
          if (!res.ok) throw new Error('Upload failed');

          const { storageId } = (await res.json()) as { storageId: Id<'_storage'> };

          const attachmentId = await createAttachment({
            sessionId,
            filename: file.name,
            mimeType: file.type || 'application/octet-stream',
            size: file.size,
            storageId,
          });

          onFilesChange((prev) =>
            prev.map((f) =>
              f === placeholder
                ? { ...f, id: attachmentId, storageId, uploading: false }
                : f
            )
          );
        } catch (err) {
          console.error('File upload failed:', err);
          toast(`Failed to upload ${file.name}`);
          onFilesChange((prev) => prev.filter((f) => f !== placeholder));
        }
      }
    }, [onFilesChange, generateUploadUrl, createAttachment, sessionId, toast]);

    const handleRemove = useCallback(async (file: AttachedFile) => {
      onFilesChange((prev) => prev.filter((f) => f !== file));
      if (file.id) {
        try { await removeAttachment({ id: file.id }); } catch { /* best effort */ }
      }
    }, [onFilesChange, removeAttachment]);

    useImperativeHandle(ref, () => ({
      open: () => { if (!disabled) inputRef.current?.click(); },
      addFiles: (files: FileList) => { if (!disabled) handleFiles(files); },
    }), [disabled, handleFiles]);

    const acceptTypes = [...IMAGE_TYPES, ...DOCUMENT_TYPES, ...TEXT_EXTENSIONS, ...DOCUMENT_EXTENSIONS].join(',');

    return (
      <>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={acceptTypes}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = '';
          }}
        />

        <AnimatePresence>
          {attachedFiles.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap gap-1.5 mb-2">
                <AnimatePresence mode="popLayout">
                  {attachedFiles.map((file, i) => {
                    const isImage = IMAGE_TYPES.includes(file.mimeType);
                    return (
                      <motion.div
                        key={file.id || `pending-${i}`}
                        layout
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.15 }}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-white/70"
                      >
                        {file.uploading ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : isImage ? (
                          <ImageIcon className="w-3 h-3" />
                        ) : (
                          <FileText className="w-3 h-3" />
                        )}
                        <span className="max-w-[120px] truncate">{file.filename}</span>
                        {!file.uploading && (
                          <button
                            type="button"
                            onClick={() => handleRemove(file)}
                            className="hover:text-white/90 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }
);
