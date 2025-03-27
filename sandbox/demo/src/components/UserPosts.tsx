import { db, Post } from "$/db"
import { selectedUser } from "$/state/selectedUser"
import { navigate, useAsync, useEffect, useRouter } from "kaioken"

export function UserPosts() {
  const { params } = useRouter()
  if (!params.userId) return navigate("/users")
  const posts = useAsync(
    () => db.collections.posts.findMany((p) => p.userId === params.userId),
    [params.userId]
  )

  useEffect(() => {
    db.collections.posts.addEventListener("write|delete", posts.invalidate)
    return () => db.collections.posts.removeEventListener("write|delete", posts.invalidate)
  }, [])

  const onCreatePostClick = async () => {
    await db.collections.posts.create({ userId: params.userId, content: "New post" })
  }

  return (
    <div>
      <div style="display:flex;gap:2rem;align-items:center;">
        <h3 style="display:flex;gap:0.5rem;align-items:center">
          Posts by
          <span style="padding: 0.25rem 0.5rem; border-radius: 8px; background: #444; border: 1px solid #333; font-size: small">
            <UsernameView userId={params.userId} />
          </span>
        </h3>
        <button onclick={onCreatePostClick}>Create post</button>
      </div>

      <div>
        {posts.loading ? (
          <p>Loading posts...</p>
        ) : posts.error ? (
          <p>{posts.error.message}</p>
        ) : (
          <>
            {posts.data.map((post) => (
              <PostItemView key={post.id} post={post} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function PostItemView({ post }: { post: Post }) {
  return (
    <div>
      <div style="display:flex;gap:2rem;align-items:center;justify-content:space-between">
        <h4>{post.content}</h4>
        <UsernameView userId={post.userId} />
      </div>
      {selectedUser.value?.id === post.userId && (
        <button
          style="background: #f00; color: #fff; border: none; padding: 0.5rem 1rem; font-size: 1rem; cursor: pointer;"
          onclick={() => db.collections.posts.delete((p) => p.id === post.id)}
        >
          Delete
        </button>
      )}
      <PostCommentsView postId={post.id} />
    </div>
  )
}

function PostCommentsView({ postId }: { postId: string }) {
  const postComments = useAsync(
    () => db.collections.postComments.findMany((c) => c.postId === postId),
    [postId]
  )

  useEffect(() => {
    db.collections.postComments.addEventListener("write|delete", postComments.invalidate)
    return () =>
      db.collections.postComments.removeEventListener("write|delete", postComments.invalidate)
  }, [])

  const handleCreateComment = async () => {
    if (!selectedUser.value) {
      alert("Please select a user")
      return
    }
    await db.collections.postComments.create({
      postId,
      content: "New comment",
      userId: selectedUser.value.id,
    })
  }

  return (
    <>
      <button onclick={handleCreateComment} style="margin-bottom:8px">
        Add Comment
      </button>
      <div>
        {postComments.loading ? (
          <p>Loading comments...</p>
        ) : postComments.error ? (
          <p>{postComments.error.message}</p>
        ) : (
          <>
            {postComments.data.length === 0 ? (
              <i>No comments</i>
            ) : (
              postComments.data.map((comment) => (
                <div
                  key={comment.id}
                  style="display:flex;gap:2rem;align-items:center; background: #1a1a1a; padding: 0.5rem; border-radius: 8px;"
                >
                  <p>{comment.content}</p>
                  <UsernameView userId={comment.userId} />
                </div>
              ))
            )}
          </>
        )}
      </div>
    </>
  )
}

function UsernameView({ userId }: { userId: string }) {
  const { data, loading, error } = useAsync(() => db.collections.users.find(userId), [userId])
  return loading ? "Loading..." : error ? error.message : data ? data.name : "User not found"
}
