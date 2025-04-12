import React, { useState, useEffect, useRef, useCallback } from 'react';
import { sendRconCommand } from '../services/api';
import FluentInput from './ui/FluentInput';
import FluentButton from './ui/FluentButton';
import { LuTerminal } from 'react-icons/lu';

interface RconTerminalProps {
    serverId: number;
}

const RconTerminal: React.FC<RconTerminalProps> = ({ serverId }) => {
    const [output, setOutput] = useState<string[]>(['RCON 终端已连接。']);
    const [input, setInput] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const outputEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        outputEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }

    useEffect(scrollToBottom, [output]);

    const handleSendCommand = useCallback(async () => {
        if (!input.trim() || isLoading) return;
        const commandToSend = input;
        setOutput(prev => [...prev, `> ${commandToSend}`]);
        setInput('');
        setIsLoading(true);
        setError(null);
        try {
            const response = await sendRconCommand(serverId, commandToSend);
            const responseLines = response.data.response.split('\n');
            setOutput(prev => [...prev, ...responseLines]);
        } catch (err: any) {
            const errorMsg = err.response?.data?.message || err.message || '发送命令失败';
            setOutput(prev => [...prev, `错误: ${errorMsg}`]);
            setError(errorMsg);
        } finally {
            setIsLoading(false);
        }
    }, [input, isLoading, serverId]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInput(e.target.value);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSendCommand();
        }
    };

    return (
        <div className="space-y-fluent-md">
            <div 
                className="bg-neutral-background-dark text-neutral-foreground-static font-mono text-xs p-fluent-md rounded-fluent-sm border border-neutral-stroke overflow-auto h-80 whitespace-pre-wrap"
            >
                {output.map((line, index) => (
                    <div key={index}>
                        {line}
                    </div>
                ))}
                <div ref={outputEndRef} />
            </div>
            <div className="flex space-x-fluent-sm items-center">
                <FluentInput
                    id="rcon-terminal-input"
                    type="text"
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder="输入 RCON 命令..."
                    disabled={isLoading}
                    className="flex-grow !mb-0"
                    aria-label="RCON Command Input"
                />
                <FluentButton 
                    onClick={handleSendCommand} 
                    disabled={isLoading || !input.trim()}
                    variant="primary"
                    icon={<LuTerminal />}
                    className="!bg-blue-600 !text-white font-bold"
                    aria-label="Send RCON Command"
                >
                    {isLoading ? '发送中...' : '发送'}
                </FluentButton>
            </div>
            {error && !isLoading && (
                <p className="text-xs text-danger mt-fluent-xs">上次命令错误: {error}</p>
            )}
        </div>
    );
};

export default RconTerminal; 