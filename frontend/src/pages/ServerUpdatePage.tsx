import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import Card from '../components/ui/Card';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import AlertMessage from '../components/ui/AlertMessage';
import FluentButton from '../components/ui/FluentButton';
import { LuArrowLeft } from 'react-icons/lu';

const backendPort = 3000;
const socketURL = `${window.location.protocol}//${window.location.hostname}:${backendPort}/realtime`;

type UpdateStatus = 'idle' | 'connecting' | 'updating' | 'success' | 'error';

function ServerUpdatePage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [status, setStatus] = useState<UpdateStatus>('connecting');
    const [logs, setLogs] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const logContainerRef = useRef<HTMLPreElement>(null);

    useEffect(() => {
        if (!id) {
            setError('Server ID is missing.');
            setStatus('error');
            return;
        }

        const serverId = id;
        const room = `update-${serverId}`;
        console.log(`Attempting to connect WebSocket to: ${socketURL}`); 

        // Prevent multiple connections if effect runs again unexpectedly
        if (socketRef.current) {
            console.log("WebSocket connection already initialized. Skipping.");
            return;
        }

        // Initialize socket connection
        socketRef.current = io(socketURL, {
            reconnectionAttempts: 3,
            timeout: 10000,
        });

        const socket = socketRef.current;

        socket.on('connect', () => {
            console.log('WebSocket connected:', socket.id);
            socket.emit('joinUpdateRoom', room);
            setStatus('updating');
        });

        socket.on('connect_error', (err) => {
             console.error('WebSocket connection error:', err);
             setError(`Failed to connect to update feed: ${err.message}`);
             setStatus('error');
             // Attempt to disconnect if connection failed
             socketRef.current?.disconnect(); 
        });

        socket.on('disconnect', (reason) => {
            console.log('WebSocket disconnected:', reason);
            // Check status via ref or directly compare if needed, 
            // but avoid causing re-run based on status here
            setStatus(currentStatus => {
                if (currentStatus !== 'success' && currentStatus !== 'error') {
                    setError('Lost connection to update feed.');
                    return 'error';
                }
                return currentStatus; // Keep success/error state
            });
        });

        // --- Listen for update events ---
        socket.on('updateLog', (line: string) => {
            setLogs(prev => [...prev, line]);
        });

        socket.on('updateComplete', (message: string) => {
            setLogs(prev => [...prev, `Success: ${message}`]);
            setStatus('success');
            socketRef.current?.disconnect(); // Clean up connection
            setTimeout(() => navigate('/'), 3000); 
        });

        socket.on('updateError', (errorMessage: string) => {
            console.error('Update Error:', errorMessage);
            setLogs(prev => [...prev, `Error: ${errorMessage}`]);
            setError(errorMessage);
            setStatus('error');
            socketRef.current?.disconnect(); // Clean up connection
        });

        socket.on('update-complete', () => {
            setStatus('success');
            alert('升级成功！即将返回仪表板...');
            setTimeout(() => navigate('/'), 5000);
        });

        // Cleanup function
        return () => {
            if (socketRef.current) {
                console.log('Cleaning up WebSocket connection.');
                socketRef.current.emit('leaveUpdateRoom', room);
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        };
        // Only run on mount and when id changes
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