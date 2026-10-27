import { Component, type ReactNode } from "react";

export class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { bad: boolean }> {
    state = { bad: false };
    static getDerivedStateFromError() {
        return { bad: true };
    }
    render() {
        return this.state.bad ? this.props.fallback : this.props.children;
    }
}