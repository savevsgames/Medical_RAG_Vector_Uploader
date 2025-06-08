import React from 'react';
import { Modal } from '../ui';

interface DocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function DocumentModal({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  footer,
  size = 'lg'
}: DocumentModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size={size}
      footer={footer}
    >
      {children}
    </Modal>
  );
}