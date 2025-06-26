import { WebSocketServer } from 'ws';
import { parse } from 'url';
import jwt from 'jsonwebtoken';
import { errorLogger } from '../agent_utils/shared/logger.js';
import { ConversationSessionService } from '../services/ConversationSessionService.js';
import { TxAgentRAGService } from '../lib/services/TxAgentRAGService.js';
import axios from 'axios';

export class ConversationWebSocketHandler {
  constructor(server, supabaseClient) {
    this.supabaseClient = supabaseClient;
    this.sessionService = new ConversationSessionService(supabaseClient);
    this.activeConnections = new Map(); // sessionId -> WebSocket connection
    this.userSessions = new Map(); // userId -> Set of sessionIds
    
    // Initialize WebSocket server
    this.wss = new WebSocketServer({
      server,
      path: '/conversation/stream',
      verifyClient: this.verifyClient.bind(this)
    });

    this.wss.on('connection', this.handleConnection.bind(this));
    
    errorLogger.info('ConversationWebSocketHandler initialized', {
      component: 'ConversationWebSocketHandler'
    });
  }

  /**
   * Verify WebSocket client connection
   */
  verifyClient(info) {
    try {
      const url = parse(info.req.url, true);
      const sessionId = url.pathname.split('/').pop();
      
      if (!sessionId || !sessionId.startsWith('conv-')) {
        errorLogger.warn('Invalid session ID in WebSocket connection', {
          sessionId,
          component: 'ConversationWebSocketHandler'
        });
        return false;
      }

      // Store session ID for later use
      info.req.sessionId = sessionId;
      return true;

    } catch (error) {
      errorLogger.error('WebSocket client verification failed', error, {
        component: 'ConversationWebSocketHandler'
      });
      return false;
    }
  }

  /**
   * Handle new WebSocket connection
   */
  async handleConnection(ws, req) {
    const sessionId = req.sessionId;
    
    try {
      // Extract JWT token from query parameters or headers
      const url = parse(req.url, true);
      const token = url.query.token || req.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        throw new Error('No authentication token provided');
      }

      // Verify JWT token
      const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET);
      const userId = decoded.sub;

      // Verify session exists and belongs to user
      const session = await this.sessionService.getSession(sessionId, userId);
      
      if (session.status !== 'active') {
        throw new Error('Session is not active');
      }

      // Store connection
      this.activeConnections.set(sessionId, {
        ws,
        userId,
        sessionId,
        session,
        connectedAt: new Date(),
        lastActivity: new Date()
      });

      // Track user sessions
      if (!this.userSessions.has(userId)) {
        this.userSessions.set(userId, new Set());
      }
      this.userSessions.get(userId).add(sessionId);

      errorLogger.info('WebSocket connection established', {
        sessionId,
        userId,
        component: 'ConversationWebSocketHandler'
      });

      // Set up message handlers
      ws.on('message', (data) => this.handleMessage(sessionId, data));
      ws.on('close', () => this.handleDisconnection(sessionId));
      ws.on('error', (error) => this.handleError(sessionId, error));

      // Send connection confirmation
      this.sendMessage(sessionId, {
        type: 'connection_established',
        payload: {
          session_id: sessionId,
          status: 'connected',
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      errorLogger.error('WebSocket connection failed', error, {
        sessionId,
        component: 'ConversationWebSocketHandler'
      });

      ws.send(JSON.stringify({
        type: 'connection_error',
        payload: {
          error: error.message,
          timestamp: new Date().toISOString()
        }
      }));

      ws.close(1008, 'Authentication failed');
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  async handleMessage(sessionId, data) {
    const connection = this.activeConnections.get(sessionId);
    if (!connection) return;

    try {
      const message = JSON.parse(data.toString());
      connection.lastActivity = new Date();

      errorLogger.debug('WebSocket message received', {
        sessionId,
        userId: connection.userId,
        messageType: message.type,
        component: 'ConversationWebSocketHandler'
      });

      switch (message.type) {
        case 'audio_chunk':
          await this.handleAudioChunk(sessionId, message.payload);
          break;
        
        case 'audio_final':
          await this.handleFinalAudio(sessionId, message.payload);
          break;
        
        case 'text_message':
          await this.handleTextMessage(sessionId, message.payload);
          break;
        
        case 'interrupt_ai':
          await this.handleInterruption(sessionId);
          break;
        
        case 'ping':
          this.sendMessage(sessionId, { type: 'pong', payload: { timestamp: new Date().toISOString() } });
          break;
        
        default:
          errorLogger.warn('Unknown message type received', {
            sessionId,
            messageType: message.type,
            component: 'ConversationWebSocketHandler'
          });
      }

    } catch (error) {
      errorLogger.error('Failed to handle WebSocket message', error, {
        sessionId,
        component: 'ConversationWebSocketHandler'
      });

      this.sendMessage(sessionId, {
        type: 'error',
        payload: {
          error: 'Failed to process message',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   * Handle audio chunk (streaming audio)
   */
  async handleAudioChunk(sessionId, payload) {
    const connection = this.activeConnections.get(sessionId);
    if (!connection) return;

    // Store audio chunk for processing when final audio is received
    if (!connection.audioBuffer) {
      connection.audioBuffer = [];
    }
    
    connection.audioBuffer.push(payload.audioData);

    // Send acknowledgment
    this.sendMessage(sessionId, {
      type: 'audio_chunk_received',
      payload: {
        chunk_id: payload.chunkId,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Handle final audio (complete user speech)
   */
  async handleFinalAudio(sessionId, payload) {
    const connection = this.activeConnections.get(sessionId);
    if (!connection) return;

    try {
      // Combine audio chunks
      const audioData = connection.audioBuffer ? 
        Buffer.concat(connection.audioBuffer.map(chunk => Buffer.from(chunk, 'base64'))) :
        Buffer.from(payload.audioData, 'base64');

      // Clear audio buffer
      connection.audioBuffer = [];

      errorLogger.info('Processing final audio for conversation', {
        sessionId,
        userId: connection.userId,
        audioSize: audioData.length,
        component: 'ConversationWebSocketHandler'
      });

      // Send processing status
      this.sendMessage(sessionId, {
        type: 'processing_started',
        payload: {
          stage: 'transcription',
          timestamp: new Date().toISOString()
        }
      });

      // Step 1: Transcribe audio using existing STT service
      const transcript = await this.transcribeAudio(audioData);
      
      if (!transcript || transcript.trim().length === 0) {
        throw new Error('No speech detected in audio');
      }

      // Add user message to conversation history
      await this.sessionService.addMessage(sessionId, connection.userId, {
        type: 'user',
        content: transcript,
        audio_data: payload.audioData
      });

      // Send transcription result
      this.sendMessage(sessionId, {
        type: 'transcription_complete',
        payload: {
          transcript,
          timestamp: new Date().toISOString()
        }
      });

      // Step 2: Process with RAG and TxAgent
      await this.processConversationTurn(sessionId, transcript);

    } catch (error) {
      errorLogger.error('Failed to process final audio', error, {
        sessionId,
        component: 'ConversationWebSocketHandler'
      });

      this.sendMessage(sessionId, {
        type: 'processing_error',
        payload: {
          error: 'Failed to process audio',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   * Handle text message (for testing or text-only mode)
   */
  async handleTextMessage(sessionId, payload) {
    const connection = this.activeConnections.get(sessionId);
    if (!connection) return;

    try {
      const { text } = payload;

      // Add user message to conversation history
      await this.sessionService.addMessage(sessionId, connection.userId, {
        type: 'user',
        content: text
      });

      // Process with RAG and TxAgent
      await this.processConversationTurn(sessionId, text);

    } catch (error) {
      errorLogger.error('Failed to process text message', error, {
        sessionId,
        component: 'ConversationWebSocketHandler'
      });

      this.sendMessage(sessionId, {
        type: 'processing_error',
        payload: {
          error: 'Failed to process text message',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   * Process conversation turn with RAG and TxAgent
   */
  async processConversationTurn(sessionId, userInput) {
    const connection = this.activeConnections.get(sessionId);
    if (!connection) return;

    try {
      // Send RAG processing status
      this.sendMessage(sessionId, {
        type: 'processing_started',
        payload: {
          stage: 'rag_retrieval',
          timestamp: new Date().toISOString()
        }
      });

      // Check for emergency keywords
      const emergencyKeywords = [
        'chest pain', 'difficulty breathing', 'severe bleeding', 'unconscious',
        'heart attack', 'stroke', 'seizure', 'severe allergic reaction',
        'suicidal thoughts', 'overdose', 'can\'t breathe', 'choking'
      ];

      const isEmergency = emergencyKeywords.some(keyword => 
        userInput.toLowerCase().includes(keyword)
      );

      if (isEmergency) {
        const emergencyResponse = 'I\'ve detected that you may be experiencing a medical emergency. Please contact emergency services immediately (call 911) or go to the nearest emergency room. This system cannot provide emergency medical care.';
        
        // Add emergency response to conversation history
        await this.sessionService.addMessage(sessionId, connection.userId, {
          type: 'assistant',
          content: emergencyResponse,
          emergency_detected: true
        });

        // Send emergency response
        this.sendMessage(sessionId, {
          type: 'emergency_detected',
          payload: {
            text: emergencyResponse,
            timestamp: new Date().toISOString()
          }
        });

        return;
      }

      // Get TxAgent URL from environment or active agent
      const txAgentUrl = process.env.RUNPOD_EMBEDDING_URL;
      if (!txAgentUrl) {
        throw new Error('TxAgent URL not configured');
      }

      // Initialize RAG service
      const ragService = new TxAgentRAGService(
        this.supabaseClient,
        txAgentUrl,
        `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` // Use service role for internal operations
      );

      // Perform RAG workflow
      const ragResult = await ragService.performRAG(userInput, 5, 0.7);

      // Send RAG completion status
      this.sendMessage(sessionId, {
        type: 'rag_complete',
        payload: {
          documents_found: ragResult.documentsFound,
          sources: ragResult.sources,
          timestamp: new Date().toISOString()
        }
      });

      // Send AI processing status
      this.sendMessage(sessionId, {
        type: 'processing_started',
        payload: {
          stage: 'ai_generation',
          timestamp: new Date().toISOString()
        }
      });

      // Create augmented prompt
      const augmentedQuery = ragService.createAugmentedPrompt(
        userInput,
        ragResult.context,
        connection.session.medical_profile,
        connection.session.conversation_history
      );

      // Call TxAgent with augmented prompt
      const aiResponse = await this.callTxAgent(txAgentUrl, augmentedQuery);

      // Add AI response to conversation history
      await this.sessionService.addMessage(sessionId, connection.userId, {
        type: 'assistant',
        content: aiResponse.text,
        sources: ragResult.sources,
        rag_info: {
          used: true,
          documents_found: ragResult.documentsFound
        }
      });

      // Send AI response
      this.sendMessage(sessionId, {
        type: 'ai_response_complete',
        payload: {
          text: aiResponse.text,
          sources: ragResult.sources,
          rag_info: {
            used: true,
            documents_found: ragResult.documentsFound
          },
          timestamp: new Date().toISOString()
        }
      });

      // Generate TTS audio
      if (connection.session.session_metadata?.enable_voice !== false) {
        await this.generateAndSendTTS(sessionId, aiResponse.text);
      }

    } catch (error) {
      errorLogger.error('Failed to process conversation turn', error, {
        sessionId,
        userInput: userInput.substring(0, 100),
        component: 'ConversationWebSocketHandler'
      });

      this.sendMessage(sessionId, {
        type: 'processing_error',
        payload: {
          error: 'Failed to generate AI response',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   * Transcribe audio using existing STT service
   */
  async transcribeAudio(audioData) {
    try {
      // Convert audio data to base64 for API call
      const audioBase64 = audioData.toString('base64');

      const response = await axios.post(
        `${process.env.VITE_API_URL || 'http://localhost:8000'}/api/voice/transcribe`,
        {
          audio_data: audioBase64,
          language: 'en'
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      return response.data.text;

    } catch (error) {
      errorLogger.error('Audio transcription failed', error, {
        component: 'ConversationWebSocketHandler'
      });
      throw new Error(`Transcription failed: ${error.message}`);
    }
  }

  /**
   * Call TxAgent with augmented query
   */
  async callTxAgent(txAgentUrl, query) {
    try {
      const response = await axios.post(
        `${txAgentUrl}/chat`,
        {
          query,
          top_k: 5,
          temperature: 0.7,
          stream: false
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000
        }
      );

      return {
        text: response.data.response || response.data.text || 'No response generated',
        model: response.data.model || 'TxAgent',
        processing_time: response.data.processing_time
      };

    } catch (error) {
      errorLogger.error('TxAgent call failed', error, {
        component: 'ConversationWebSocketHandler'
      });
      throw new Error(`TxAgent call failed: ${error.message}`);
    }
  }

  /**
   * Generate and send TTS audio
   */
  async generateAndSendTTS(sessionId, text) {
    try {
      const response = await axios.post(
        `${process.env.VITE_API_URL || 'http://localhost:8000'}/api/voice/tts`,
        {
          text,
          voice_id: 'default'
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      this.sendMessage(sessionId, {
        type: 'tts_audio_ready',
        payload: {
          audio_url: response.data.audio_url,
          duration_estimate: response.data.duration_estimate,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      errorLogger.error('TTS generation failed', error, {
        sessionId,
        component: 'ConversationWebSocketHandler'
      });

      // Don't fail the entire conversation for TTS errors
      this.sendMessage(sessionId, {
        type: 'tts_error',
        payload: {
          error: 'Voice generation failed',
          details: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  /**
   * Handle AI interruption
   */
  async handleInterruption(sessionId) {
    const connection = this.activeConnections.get(sessionId);
    if (!connection) return;

    errorLogger.info('AI interruption requested', {
      sessionId,
      userId: connection.userId,
      component: 'ConversationWebSocketHandler'
    });

    // Send interruption acknowledgment
    this.sendMessage(sessionId, {
      type: 'ai_interrupted',
      payload: {
        timestamp: new Date().toISOString()
      }
    });

    // Add interruption to conversation history
    await this.sessionService.addMessage(sessionId, connection.userId, {
      type: 'system',
      content: 'User interrupted AI response',
      action: 'interruption'
    });
  }

  /**
   * Handle WebSocket disconnection
   */
  handleDisconnection(sessionId) {
    const connection = this.activeConnections.get(sessionId);
    if (!connection) return;

    errorLogger.info('WebSocket connection closed', {
      sessionId,
      userId: connection.userId,
      duration: new Date() - connection.connectedAt,
      component: 'ConversationWebSocketHandler'
    });

    // Clean up connection tracking
    this.activeConnections.delete(sessionId);
    
    if (this.userSessions.has(connection.userId)) {
      this.userSessions.get(connection.userId).delete(sessionId);
      if (this.userSessions.get(connection.userId).size === 0) {
        this.userSessions.delete(connection.userId);
      }
    }

    // Update session status to paused (not ended, in case user reconnects)
    this.sessionService.updateStatus(sessionId, connection.userId, 'paused')
      .catch(error => {
        errorLogger.error('Failed to update session status on disconnect', error, {
          sessionId,
          component: 'ConversationWebSocketHandler'
        });
      });
  }

  /**
   * Handle WebSocket errors
   */
  handleError(sessionId, error) {
    const connection = this.activeConnections.get(sessionId);
    
    errorLogger.error('WebSocket error occurred', error, {
      sessionId,
      userId: connection?.userId,
      component: 'ConversationWebSocketHandler'
    });
  }

  /**
   * Send message to specific session
   */
  sendMessage(sessionId, message) {
    const connection = this.activeConnections.get(sessionId);
    if (!connection || connection.ws.readyState !== 1) return false;

    try {
      connection.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      errorLogger.error('Failed to send WebSocket message', error, {
        sessionId,
        messageType: message.type,
        component: 'ConversationWebSocketHandler'
      });
      return false;
    }
  }

  /**
   * Broadcast message to all sessions of a user
   */
  broadcastToUser(userId, message) {
    const userSessions = this.userSessions.get(userId);
    if (!userSessions) return 0;

    let sentCount = 0;
    for (const sessionId of userSessions) {
      if (this.sendMessage(sessionId, message)) {
        sentCount++;
      }
    }

    return sentCount;
  }

  /**
   * Get connection statistics
   */
  getStats() {
    return {
      active_connections: this.activeConnections.size,
      active_users: this.userSessions.size,
      connections_by_user: Array.from(this.userSessions.entries()).map(([userId, sessions]) => ({
        user_id: userId,
        session_count: sessions.size
      }))
    };
  }
}