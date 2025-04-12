import React, { useState } from 'react';
import { BanEntry } from '../types/ban';
// Import shared UI components
import FluentButton from './ui/FluentButton';
import FluentTable from './ui/FluentTable';
import FluentRow from './ui/FluentRow';

// --- Remove Reusable Fluent UI Components (Temporary definitions) ---
// interface FluentButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
//     variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'warning';
//     icon?: React.ReactNode;
//     size?: 'small' | 'medium';
// }
// const FluentButton: React.FC<FluentButtonProps> = ({ variant = 'secondary', size = 'medium', children, ...props }) => <button {...props}>{children}</button>;
//
// interface FluentTableProps {
//     headers: string[];
//     children: React.ReactNode;
//     className?: string;
// }
// const FluentTable: React.FC<FluentTableProps> = ({ headers, children }) => <table><thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table>;
// --- End Temporary definitions ---

interface BanListProps {
    bans: BanEntry[];
    onUnban: (lineContent: string) => Promise<void>; // Function to handle unban request
    isLoading: boolean;
    error: string | null;
    // Pass Fluent UI components as props if not globally available
    // TableComponent?: React.ComponentType<any>; 
    // ButtonComponent?: React.ComponentType<any>;
}

// Helper function to format Unix timestamp
const formatTimestamp = (timestamp: number): string => {
    if (timestamp === 0) return '永久';
    try {
        return new Date(timestamp * 1000).toLocaleString();
    } catch (e) {
        return '无效日期';
    }
};

const BanList: React.FC<BanListProps> = ({ 
    bans, 
    onUnban, 
    isLoading, 
    error, 
    // TableComponent = FluentTable, // Default to imported/global
    // ButtonComponent = FluentButton 
}) => {

    const [unbanningLine, setUnbanningLine] = useState<string | null>(null); // State for loading indicator

    const handleUnbanClick = async (line: string) => {
        if (window.confirm(`确定要解禁这条记录吗？\n${line}`)) {
            setUnbanningLine(line); // Set loading state for this specific row
            try {
                 await onUnban(line);
                 // Refresh handled by parent component
            } catch (err: any) {
                 alert(`解禁失败: ${err.response?.data?.message || err.message || '未知错误'}`);
            } finally {
                setUnbanningLine(null); // Clear loading state
            }
        }
    };

    if (isLoading) return <p className="text-sm text-gray-500 italic">正在加载 Ban 列表...</p>;
    if (error) return <p className="text-sm text-red-500">加载 Ban 列表失败: {error}</p>;
    if (!bans || bans.length === 0) return <p className="text-sm text-gray-500 italic">当前没有 Ban 记录。</p>;

    const tableHeaders = ["EOS ID", "过期时间", "原因/注释", "操作"];

    return (
        <div className="space-y-4">
            <h4 className="text-md font-semibold text-gray-700">Ban 列表 ({bans.length} 条记录)</h4>
            <FluentTable headers={tableHeaders}>
                {bans.map((ban, index) => {
                    const isUnbanningThis = unbanningLine === ban.originalLine;
                    return (
                        <FluentRow key={index}>
                            <td className="whitespace-nowrap text-gray-500 font-mono">{ban.bannedEosId || 'N/A'}</td>
                            <td className="whitespace-nowrap text-gray-700">{formatTimestamp(ban.expirationTimestamp)}</td>
                            <td className="text-gray-700 max-w-md truncate" title={ban.comment || '无'}>{ban.comment || '-'}</td>
                            <td className="whitespace-nowrap text-right">
                                <FluentButton 
                                    size="small" 
                                    variant="danger" 
                                    onClick={() => handleUnbanClick(ban.originalLine)}
                                    disabled={isUnbanningThis} // Disable button while unbanning this specific row
                                >
                                    {isUnbanningThis ? '处理中...' : '解 Ban'}
                                </FluentButton>
                            </td>
                        </FluentRow>
                    );
                })}
            </FluentTable>
        </div>
    );
};

// Remove old style objects if no longer used
// const thStyle: React.CSSProperties = { ... };
// const tdStyle: React.CSSProperties = { ... };

export default BanList; 