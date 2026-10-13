import React, { useState } from 'react';
import { ListFilter, Star, CheckCircle2 } from 'lucide-react';
import CandidateCard from './CandidateCard';

/**
 * CandidatePipeline
 * Three-column CV tracking pipeline representing the business workflow:
 *  Column A - Total Internally Shortlisted (Every internally shortlisted CV; treated as transmitted to client)
 *  Column B - Good CVs (Subset of internally shortlisted CVs rated 'Good'; counts toward target)
 *  Column C - External Shortlists (Candidates confirmed accepted & shortlisted by client)
 */
export default function CandidatePipeline({
  submissions = [],
  isReadOnly = false,
  target = 0,
  onUpdateStatus,
  onDelete,
  onDownload,
  onRequestClientDecisionConfirmation
}) {
  const [draggedItem, setDraggedItem] = useState(null);
  const [activeDropColumn, setActiveDropColumn] = useState(null);

  // Group candidates into the 3 columns
  const safeSubmissions = Array.isArray(submissions) ? submissions : [];

  // Column A: Every internally shortlisted CV in this attempt
  const colASubmissions = safeSubmissions.filter(
    s => s && s.internalShortlistStatus === 'Shortlisted'
  );

  // Column B: Subset of internally shortlisted CVs with qualityRating === 'Good'
  const colBSubmissions = safeSubmissions.filter(
    s => s && s.internalShortlistStatus === 'Shortlisted' && s.qualityRating === 'Good'
  );

  // Column C: Genuine client decisions where client accepted & shortlisted
  const colCSubmissions = safeSubmissions.filter(
    s => s && s.sentToClient === true && s.clientShortlistStatus === 'Shortlisted'
  );

  const columns = [
    {
      key: 'internallyShortlisted',
      title: 'Total Internally Shortlisted',
      subtitle: 'All internally shortlisted CVs (transmitted to client)',
      candidates: colASubmissions,
      countLabel: `${colASubmissions.length}`,
      icon: <ListFilter size={16} className="text-forest-600" />,
      colorClass: 'stage-column--shortlisted',
      emptyMessage: 'No internally shortlisted CVs in this attempt'
    },
    {
      key: 'goodCvs',
      title: 'Good CVs',
      subtitle: 'Subset meeting Good criteria (counts toward target)',
      candidates: colBSubmissions,
      countLabel: target > 0 ? `${colBSubmissions.length} / ${target}` : `${colBSubmissions.length}`,
      icon: <Star size={16} className="text-emerald-600" />,
      colorClass: 'stage-column--good',
      emptyMessage: 'No Good CVs yet (Drag CV here or select ★ Good)'
    },
    {
      key: 'externalShortlists',
      title: 'External Shortlists',
      subtitle: 'Accepted & approved by client',
      candidates: colCSubmissions,
      countLabel: `${colCSubmissions.length}`,
      icon: <CheckCircle2 size={16} className="text-forest-600" />,
      colorClass: 'stage-column--accepted',
      emptyMessage: 'No external client shortlists yet'
    }
  ];

  const handleDragStart = (e, candidate, sourceColumnKey) => {
    if (isReadOnly) return;
    setDraggedItem({ candidate, sourceColumnKey });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', candidate._id);
  };

  const handleDragOver = (e, columnKey) => {
    if (isReadOnly || !draggedItem) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (activeDropColumn !== columnKey) {
      setActiveDropColumn(columnKey);
    }
  };

  const handleDragLeave = (e, columnKey) => {
    e.preventDefault();
    e.stopPropagation();
    if (activeDropColumn === columnKey) {
      setActiveDropColumn(null);
    }
  };

  const handleDrop = async (e, targetColumnKey) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveDropColumn(null);

    const item = draggedItem;
    setDraggedItem(null);
    if (!item || !item.candidate || isReadOnly) return;

    const { candidate, sourceColumnKey } = item;

    // Handle dropping onto Column B (Good CVs)
    if (targetColumnKey === 'goodCvs') {
      if (candidate.qualityRating !== 'Good') {
        await onUpdateStatus(candidate._id, { qualityRating: 'Good' });
      }
      return;
    }

    // Handle dropping onto Column A (Total Internally Shortlisted)
    if (targetColumnKey === 'internallyShortlisted') {
      if (sourceColumnKey === 'goodCvs') {
        const confirmChange = window.confirm(
          `Change rating for "${candidate.unverifiedLabel || 'Candidate'}" from Good to Optional?`
        );
        if (confirmChange) {
          await onUpdateStatus(candidate._id, { qualityRating: 'Optional' });
        }
      } else if (sourceColumnKey === 'externalShortlists') {
        const confirmRevert = window.confirm(
          `Revert client decision for "${candidate.unverifiedLabel || 'Candidate'}" back to Pending?`
        );
        if (confirmRevert) {
          await onUpdateStatus(candidate._id, {
            clientShortlistStatus: 'Pending',
            clientShortlistDate: null
          });
        }
      }
      return;
    }

    // Handle dropping onto Column C (External Shortlists)
    if (targetColumnKey === 'externalShortlists') {
      if (candidate.clientShortlistStatus !== 'Shortlisted') {
        onRequestClientDecisionConfirmation(candidate, 'Shortlisted');
      }
      return;
    }
  };

  return (
    <div className="candidate-pipeline-container">
      <div className="candidate-pipeline-grid">
        {columns.map((col) => {
          const isDropActive = activeDropColumn === col.key;

          return (
            <div
              key={col.key}
              className={`pipeline-column ${col.colorClass} ${
                isDropActive ? 'pipeline-column--drop-target' : ''
              }`}
              onDragOver={(e) => handleDragOver(e, col.key)}
              onDragLeave={(e) => handleDragLeave(e, col.key)}
              onDrop={(e) => handleDrop(e, col.key)}
            >
              {/* Column Header */}
              <div className="pipeline-column-header">
                <div className="pipeline-column-title-row">
                  <div className="pipeline-column-title-flex">
                    {col.icon}
                    <h4 className="pipeline-column-title">{col.title}</h4>
                  </div>
                  <span className="pipeline-column-badge">{col.countLabel}</span>
                </div>
                <p className="pipeline-column-subtitle">{col.subtitle}</p>
              </div>

              {/* Column Cards Container */}
              <div className="pipeline-column-body">
                {col.candidates.length === 0 ? (
                  <div className="pipeline-empty-placeholder">
                    <span>{col.emptyMessage}</span>
                  </div>
                ) : (
                  col.candidates.map((candidate) => (
                    <CandidateCard
                      key={`${col.key}-${candidate._id}`}
                      candidate={candidate}
                      columnKey={col.key}
                      isReadOnly={isReadOnly}
                      onUpdateStatus={onUpdateStatus}
                      onDelete={onDelete}
                      onDownload={onDownload}
                      onRequestClientDecisionConfirmation={onRequestClientDecisionConfirmation}
                      onDragStart={(e, c) => handleDragStart(e, c, col.key)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
