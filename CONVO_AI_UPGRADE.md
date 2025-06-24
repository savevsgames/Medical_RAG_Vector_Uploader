# Conversational AI Upgrade Plan for Symptom Savior

## Overview

This document outlines a comprehensive plan to enhance the Symptom Savior application with real-time conversational AI capabilities. The goal is to transform the current turn-based interaction model into a more natural, continuous conversation experience similar to modern voice assistants.

## Current State

The application currently uses a turn-based interaction model:
1. User taps a button to start recording
2. User speaks and then stops recording
3. Audio is sent to backend for transcription
4. Transcribed text is sent to TxAgent for processing
5. TxAgent response is received and displayed
6. Optionally, the response is converted to speech via ElevenLabs TTS

This approach works but creates a disjointed experience that feels mechanical rather than conversational.

## Target State

We aim to implement a more natural conversational experience:
1. User taps a button to initiate a conversation session
2. User speaks and the system listens continuously
3. System detects natural pauses in speech to process segments in real-time
4. AI responds while maintaining context of the entire conversation
5. User can interrupt or continue speaking without manual button presses
6. The conversation flows naturally with appropriate turn-taking

## Implementation Plan

### Phase 1: Foundation (1-2 weeks)

#### 1.1 WebSocket Infrastructure
- Create a new WebSocket endpoint on the backend (`/api/conversation-stream`)
- Implement WebSocket client in the mobile app
- Establish secure authentication for WebSocket connections
- Set up bidirectional communication protocol

#### 1.2 Streaming Audio Capture
- Implement continuous audio recording with chunking
- Create audio buffer management system
- Implement voice activity detection (VAD) to identify speech segments
- Add audio compression for efficient transmission

#### 1.3 Backend Orchestration Service
- Develop a conversation manager service
- Implement session state management
- Create a message queue system for audio chunks
- Set up conversation history tracking

### Phase 2: Core Functionality (2-3 weeks)

#### 2.1 Streaming Speech-to-Text
- Integrate with ElevenLabs streaming STT API
- Implement chunk-based transcription
- Add partial results handling
- Develop confidence scoring and error correction

#### 2.2 TxAgent Integration for Streaming
- Modify TxAgent integration to support conversation context
- Implement incremental query processing
- Add support for partial responses
- Ensure medical context is maintained throughout the conversation

#### 2.3 Streaming Text-to-Speech
- Integrate with ElevenLabs streaming TTS API
- Implement chunk-based audio synthesis
- Add support for SSML markers for better prosody
- Develop audio buffering and playback management

### Phase 3: Enhanced User Experience (2-3 weeks)

#### 3.1 Conversation UI Enhancements
- Redesign chat interface for real-time conversation
- Add visual indicators for listening, thinking, and speaking states
- Implement transcript display with real-time updates
- Create smooth animations for state transitions

#### 3.2 Advanced Conversation Features
- Add support for interruptions and barge-in
- Implement context-aware responses
- Add conversation summarization
- Develop topic tracking and follow-up suggestions

#### 3.3 Performance Optimization
- Optimize audio processing for low latency
- Implement efficient data transmission
- Add bandwidth adaptation
- Develop battery usage optimizations

### Phase 4: Safety and Production Readiness (1-2 weeks)

#### 4.1 Enhanced Safety Measures
- Implement real-time emergency detection
- Add content filtering for medical appropriateness
- Develop conversation monitoring for safety concerns
- Create automatic escalation protocols

#### 4.2 Error Handling and Resilience
- Implement graceful degradation for component failures
- Add automatic recovery mechanisms
- Develop comprehensive error reporting
- Create fallback modes for different failure scenarios

#### 4.3 Testing and Validation
- Conduct extensive user testing
- Perform load testing for concurrent conversations
- Validate medical accuracy of responses
- Test across different network conditions

## Technical Architecture

### Frontend Components

```
ConversationalAI/
├── hooks/
│   ├── useConversation.ts       # Manages conversation state and WebSocket
│   ├── useStreamingAudio.ts     # Handles continuous audio recording
│   └── useAudioPlayback.ts      # Manages streaming audio playback
├── components/
│   ├── ConversationView.tsx     # Main conversation UI
│   ├── AudioVisualizer.tsx      # Visual feedback for audio
│   ├── SpeechWaveform.tsx       # Waveform visualization
│   └── ConversationControls.tsx # UI controls for conversation
├── services/
│   ├── websocketService.ts      # WebSocket connection management
│   ├── audioProcessingService.ts # Audio capture and processing
│   └── conversationService.ts   # Conversation state management
└── utils/
    ├── audioUtils.ts            # Audio processing utilities
    ├── speechDetection.ts       # Voice activity detection
    └── bufferManagement.ts      # Audio buffer management
```

### Backend Components

```
ConversationBackend/
├── websocket/
│   ├── connectionManager.js     # WebSocket connection handling
│   ├── messageHandler.js        # WebSocket message processing
│   └── sessionManager.js        # Conversation session management
├── services/
│   ├── conversationService.js   # Conversation orchestration
│   ├── streamingSTT.js          # Streaming speech-to-text service
│   ├── streamingTTS.js          # Streaming text-to-speech service
│   └── txAgentService.js        # TxAgent integration
├── models/
│   ├── conversation.js          # Conversation data model
│   ├── message.js               # Message data model
│   └── audioChunk.js            # Audio chunk data model
└── utils/
    ├── audioProcessing.js       # Audio processing utilities
    ├── safetyChecks.js          # Medical safety validation
    └── metrics.js               # Performance and usage metrics
```

### Data Flow

1. **Audio Capture**:
   ```
   User Speech → Microphone → Audio Chunks → WebSocket → Backend
   ```

2. **Speech Processing**:
   ```
   Audio Chunks → Streaming STT → Text Segments → Conversation Manager
   ```

3. **AI Processing**:
   ```
   Text Segments → TxAgent → AI Response → Conversation Manager
   ```

4. **Response Delivery**:
   ```
   AI Response → Streaming TTS → Audio Chunks → WebSocket → Frontend → Speaker
   ```

5. **State Management**:
   ```
   Conversation History → Context Manager → TxAgent → Enhanced Responses
   ```

## Technical Considerations

### 1. WebSocket Protocol Design

The WebSocket protocol will use JSON messages with the following structure:

```json
{
  "type": "audio_chunk | transcript | ai_response | tts_chunk | control",
  "payload": {
    // Type-specific data
  },
  "timestamp": 1623456789,
  "session_id": "conversation-123",
  "sequence": 42
}
```

### 2. Audio Format and Compression

- Web: `audio/webm` with Opus codec (good browser support)
- iOS: AAC format with appropriate bitrate
- Android: AAC or Opus depending on device support
- Compression target: 16-32 kbps for voice quality
- Chunk size: 100-200ms for low latency

### 3. Latency Optimization

- Target end-to-end latency: <500ms
- Audio chunk processing: <50ms
- Network transmission: <100ms
- STT processing: <150ms
- AI response generation: <150ms
- TTS generation: <100ms

### 4. Fallback Mechanisms

- Network interruption: Cache recent audio and retry
- STT failure: Offer text input option
- TxAgent unavailable: Use simpler AI model or pre-defined responses
- TTS failure: Display text response only

## Implementation Roadmap

### Month 1: Foundation and Core Components

- Week 1: WebSocket infrastructure and protocol design
- Week 2: Streaming audio capture and basic processing
- Week 3: Backend conversation management service
- Week 4: Initial integration with streaming STT/TTS

### Month 2: Integration and Enhancement

- Week 1: TxAgent integration for conversational context
- Week 2: UI enhancements for real-time conversation
- Week 3: Advanced conversation features
- Week 4: Performance optimization and testing

### Month 3: Refinement and Production

- Week 1: User testing and feedback collection
- Week 2: Refinements based on user feedback
- Week 3: Safety enhancements and error handling
- Week 4: Final testing and production deployment

## Success Metrics

1. **Conversation Quality**:
   - Average conversation length >3 turns
   - <10% conversation abandonment rate
   - >80% successful intent recognition

2. **Performance**:
   - End-to-end latency <500ms on good connections
   - <5% audio packet loss
   - <2% conversation failures due to technical issues

3. **User Experience**:
   - >80% user satisfaction rating
   - >70% preference over turn-based interaction
   - >50% increase in AI assistant usage

## Conclusion

This conversational AI upgrade will transform the Symptom Savior application from a basic turn-based interaction model to a natural, flowing conversation experience. By implementing streaming audio processing, real-time transcription, and continuous AI interaction, we can create a more engaging and helpful medical assistant that better serves users' health needs.

The phased approach allows for incremental development and testing, ensuring that each component works reliably before moving to the next stage. The end result will be a state-of-the-art conversational health assistant that provides a more natural and effective way for users to discuss their health concerns.