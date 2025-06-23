import logging
import sys
from datetime import datetime
from typing import Any, Dict
from fastapi import Request, Response

def setup_logging() -> logging.Logger:
    """Setup logging configuration"""
    
    # Create formatters
    detailed_formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Setup main logger
    logger = logging.getLogger("txagent")
    logger.setLevel(logging.INFO)
    
    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(detailed_formatter)
    logger.addHandler(console_handler)
    
    # Setup request logger
    request_logger = logging.getLogger("txagent_requests")
    request_logger.setLevel(logging.INFO)
    request_logger.addHandler(console_handler)
    
    # Setup auth logger
    auth_logger = logging.getLogger("auth_service")
    auth_logger.setLevel(logging.INFO)
    auth_logger.addHandler(console_handler)
    
    return logger

def log_request_start(request: Request):
    """Log request start"""
    logger = logging.getLogger("txagent")
    logger.info(f"🚀 REQUEST START: {request.method} {request.url.path}")
    logger.info(f"🔍 Request headers: {dict(request.headers)}")

def log_request_success(request: Request, status_code: int, processing_time: float):
    """Log successful request"""
    logger = logging.getLogger("txagent")
    logger.info(f"✅ REQUEST SUCCESS: {request.method} {request.url.path} - {status_code} ({processing_time:.2f}s)")
    
    request_logger = logging.getLogger("txagent_requests")
    request_logger.info("✅ REQUEST_SUCCESS")

def log_request_error(request: Request, error: Exception, processing_time: float):
    """Log request error"""
    logger = logging.getLogger("txagent")
    logger.error(f"❌ REQUEST ERROR: {request.method} {request.url.path} - {str(error)} ({processing_time:.2f}s)")
    
    request_logger = logging.getLogger("txagent_requests")
    request_logger.error("❌ REQUEST_ERROR")