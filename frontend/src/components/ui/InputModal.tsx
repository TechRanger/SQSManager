import React, { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button } from '@mui/material';
import FluentButton from './FluentButton'; // Assuming FluentButton can be used

interface InputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (value: string) => void;
  title: string;
  label: string;
  initialValue?: string;
  placeholder?: string;
  submitText?: string;
  cancelText?: string;
}

const InputModal: React.FC<InputModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  title,
  label,
  initialValue = '',
  placeholder = '',
  submitText = 'Submit',
  cancelText = 'Cancel',
}) => {
  const [inputValue, setInputValue] = useState(initialValue);

  // Update internal state if initialValue changes while modal is open
  useEffect(() => {
    if (isOpen) {
      setInputValue(initialValue);
    }
  }, [initialValue, isOpen]);

  const handleSubmit = () => {
    onSubmit(inputValue);
    onClose(); // Usually close after submit
  };

  const handleCancel = () => {
    onClose();
  };

  // Handle Enter key press in TextField
  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <Dialog open={isOpen} onClose={handleCancel} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          id="modal-input"
          label={label}
          type="text"
          fullWidth
          variant="outlined"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress} // Submit on Enter
          placeholder={placeholder}
          sx={{ mt: 2 }} // Add some top margin
        />
      </DialogContent>
      <DialogActions sx={{ p: '16px 24px' }}> 
        {/* Using FluentButton for consistency if possible, else use MUI Button */}
        <FluentButton onClick={handleCancel} variant="secondary">
          {cancelText}
        </FluentButton>
        <FluentButton onClick={handleSubmit} variant="primary" disabled={!inputValue.trim()}>
          {submitText}
        </FluentButton>
        {/* Fallback using MUI Buttons if FluentButton causes issues */}
        {/* <Button onClick={handleCancel} color="secondary">{cancelText}</Button>
        <Button onClick={handleSubmit} variant="contained" color="primary" disabled={!inputValue.trim()}>{submitText}</Button> */}
      </DialogActions>
    </Dialog>
  );
};

export default InputModal; 