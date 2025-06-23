"""Custom exception classes for TxAgent"""

class TxAgentException(Exception):
    """Base exception for TxAgent"""
    def __init__(self, message: str):
        self.message = message
        super().__init__(self.message)

class AuthenticationError(TxAgentException):
    """Authentication related errors"""
    pass

class ValidationError(TxAgentException):
    """Input validation errors"""
    pass

class ProcessingError(TxAgentException):
    """Processing related errors"""
    pass

class DatabaseError(TxAgentException):
    """Database related errors"""
    pass