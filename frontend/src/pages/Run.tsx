import { useParams } from 'react-router-dom'
import { useTitle } from '../hooks'
import RunForm from './run/RunForm'
import LiveRunPage from './run/LiveRun'

/** /run starts a run. /run/:benchmarkId follows one live. */
export default function Run() {
  const { benchmarkId } = useParams()
  useTitle(benchmarkId ? 'Run in progress' : 'Start a run')
  if (benchmarkId) return <LiveRunPage benchmarkId={benchmarkId} />
  return <RunForm />
}
