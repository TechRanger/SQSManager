import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
// Remove socket.io-client import
// import { io, Socket } from 'socket.io-client';
import Card from '../components/ui/Card';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import AlertMessage from '../components/ui/AlertMessage';
import FluentButton from '../components/ui/FluentButton';

// Define MessageEvent structure matching backend (if using object structure)
interface SseMessageData {
    type: 'log' | 'error' | 'complete';
    message: string;
}

type UpdateStatus = 'idle' | 'connecting' | 'updating' | 'success' | 'error';

function ServerUpdatePage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [status, setStatus] = useState<UpdateStatus>('connecting');
    const [logs, setLogs] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    // Remove socketRef
    // const socketRef = useRef<Socket | null>(null);
    const eventSourceRef = useRef<EventSource | null>(null); // Add EventSource ref
    const logContainerRef = useRef<HTMLPreElement>(null);

    useEffect(() => {
        if (!id) {
            setError('Server ID is missing.');
            setStatus('error');
            return;
        }

        // --- Get Auth Token --- 
        const authToken = localStorage.getItem('authToken');
        if (!authToken) {
            setError('Authentication token not found. Please log in again.');
            setStatus('error');
            navigate('/login'); // Redirect to login if no token
            return;
        }

        const serverId = id;
        // Construct SSE URL with token as query parameter
        const sseUrl = `/api/server-instances/${serverId}/update-stream?token=${encodeURIComponent(authToken)}`;
        console.log(`Attempting to connect SSE stream to: ${sseUrl}`);

        // Prevent multiple connections
        if (eventSourceRef.current) {
            console.log("SSE connection already initialized. Skipping.");
            return;
        }

        // Initialize EventSource connection
        // withCredentials is not needed when sending token via URL
        eventSourceRef.current = new EventSource(sseUrl);
        const eventSource = eventSourceRef.current;

        eventSource.onopen = () => {
            console.log('SSE Connection opened.');
            setStatus('updating');
        };

        eventSource.onerror = (err) => {
             console.error('SSE connection error/closed:', err);
             if (eventSource.readyState === EventSource.CLOSED) {
                 setStatus(currentStatus => {
                    if (currentStatus !== 'success' && currentStatus !== 'error') {
                        setError('Connection to update feed lost or closed unexpectedly.');
                        return 'error';
                    }
                    return currentStatus;
                });
             } else {
                 setError('Failed to connect to update feed.');
                 setStatus('error');
             }
             eventSource.close();
        };

        eventSource.onmessage = (event) => {
            try {
                const messageData = JSON.parse(event.data) as SseMessageData;
                if (messageData.type === 'log') {
                    setLogs(prev => [...prev, messageData.message]);
                } else if (messageData.type === 'error') {
                    setLogs(prev => [...prev, `Error: ${messageData.message}`]);
                    setError(messageData.message);
                    setStatus('error');
                    eventSource.close();
                } else if (messageData.type === 'complete') {
                    setLogs(prev => [...prev, `Success: ${messageData.message}`]);
                    setStatus('success');
                    eventSource.close();
                    setTimeout(() => navigate('/'), 3000);
                } else {
                     console.warn('Received unexpected SSE message structure:', messageData);
                     setLogs(prev => [...prev, event.data]);
                }
            } catch (e) {
                 console.warn('Received non-JSON SSE message:', event.data);
                 setLogs(prev => [...prev, event.data]);
                 if (event.data.toLowerCase().startsWith('success:')) {
                     setStatus('success');
                     eventSource.close();
                     setTimeout(() => navigate('/'), 3000);
                 } else if (event.data.toLowerCase().startsWith('error:')) {
                     setError(event.data);
                     setStatus('error');
                     eventSource.close();
                 }
            }
        };

        return () => {
            if (eventSourceRef.current) {
                console.log('Cleaning up SSE connection.');
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
        };
    }, [id, navigate]);

    // Auto-scroll logs
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);

    const renderStatus = () => {
        switch (status) {
            case 'connecting':
                return <LoadingSpinner text="Connecting to update feed..." />;
            case 'updating':
                return null;
            case 'success':
                return <AlertMessage type="success" title="Update Successful" message="Game files updated successfully. Redirecting to dashboard..." />;
            case 'error':
                return <AlertMessage type="error" title="Update Failed" message={error || 'An unknown error occurred during the update.'} />;
            default:
                return null;
        }
    };

    return (
        <div className="space-y-6">
            <Card title="SteamCMD 升级日志">
                <div className="mb-4">
                    {renderStatus()}
                </div>
                <pre
                    ref={logContainerRef}
                    className="bg-gray-900 text-white font-mono text-xs p-4 rounded-md overflow-auto h-96 whitespace-pre-wrap border border-gray-700"
                >
                    {logs.join('\n')}
                </pre>
                {(status === 'success' || status === 'error') && (
                    <div className="mt-4 flex justify-center">
                        <Link to="/">
                            <FluentButton variant="primary">返回仪表板</FluentButton>
                        </Link>
                    </div>
                )}
            </Card>
        </div>
    );
}

export default ServerUpdatePage; 