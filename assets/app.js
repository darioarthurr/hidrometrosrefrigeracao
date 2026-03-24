/* === CORREÇÕES v2.9.8.7 === */
.custom-select {
    position: relative;
}
.custom-select select {
    width: 100%;
    padding: 1rem 2.5rem 1rem 1rem;
    border: 2px solid var(--gray-200);
    border-radius: var(--radius);
    font-size: 1rem;
    font-weight: 600;
    background: white;
    appearance: none;
    cursor: pointer;
}
.custom-select select:focus {
    border-color: var(--gps-blue);
    box-shadow: 0 0 0 4px rgba(0, 51, 102, 0.1);
}
.select-arrow {
    position: absolute;
    right: 1rem;
    top: 50%;
    transform: translateY(-50%);
    color: var(--gray-400);
    pointer-events: none;
    font-size: 0.9rem;
}
#statusRede {
    top: 65px !important;
    right: 15px !important;
}
